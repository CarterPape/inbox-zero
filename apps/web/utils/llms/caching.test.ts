import { describe, expect, it } from "vitest";
import {
  buildCachedSystemMessages,
  getSystemCacheProviderOptions,
} from "./caching";

describe("getSystemCacheProviderOptions", () => {
  it.each([
    "openai",
    "azure",
  ])("returns a prompt cache key for %s (auto prefix caching)", (provider) => {
    expect(
      getSystemCacheProviderOptions(provider, { cacheKey: "account-1" }),
    ).toEqual({ openai: { promptCacheKey: "account-1" } });
  });

  it.each([
    "anthropic",
    "bedrock",
    "openrouter",
    "aigateway",
  ])("returns nothing for %s (caching is marked on the message instead)", (provider) => {
    expect(
      getSystemCacheProviderOptions(provider, { cacheKey: "account-1" }),
    ).toEqual({});
  });

  it.each([
    "azure-foundry",
    "google",
    "vertex",
    "groq",
    "ollama",
    "openai-compatible",
  ])("returns nothing for %s (implicit or no caching)", (provider) => {
    expect(
      getSystemCacheProviderOptions(provider, { cacheKey: "account-1" }),
    ).toEqual({});
  });
});

describe("buildCachedSystemMessages", () => {
  const base = { system: "SYSTEM", prompt: "PROMPT" };

  it("splits system and prompt into a system and user message", () => {
    const messages = buildCachedSystemMessages({ ...base, provider: "google" });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "system", content: "SYSTEM" });
    expect(messages[1]).toEqual({ role: "user", content: "PROMPT" });
  });

  it.each([
    "anthropic",
    "openrouter",
    "aigateway",
  ])("marks the system message with an ephemeral cache breakpoint for %s", (provider) => {
    const [systemMessage, userMessage] = buildCachedSystemMessages({
      ...base,
      provider,
    });

    expect(systemMessage.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
    // The user turn is the volatile part and stays unmarked.
    expect(userMessage.providerOptions).toBeUndefined();
  });

  it.each([
    "anthropic",
    "openrouter",
    "aigateway",
  ])("adds the extended cache lifetime for %s when asked for 1h", (provider) => {
    const [systemMessage] = buildCachedSystemMessages({
      ...base,
      provider,
      ttl: "1h",
    });

    expect(systemMessage.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
    });
  });

  it("omits ttl entirely at 5m, so the default request shape is unchanged", () => {
    const [explicit] = buildCachedSystemMessages({
      ...base,
      provider: "anthropic",
      ttl: "5m",
    });
    const [defaulted] = buildCachedSystemMessages({
      ...base,
      provider: "anthropic",
    });

    expect(explicit.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
    expect(explicit.providerOptions).toEqual(defaulted.providerOptions);
  });

  it("ignores ttl for bedrock, which has no equivalent marker", () => {
    const [systemMessage] = buildCachedSystemMessages({
      ...base,
      provider: "bedrock",
      ttl: "1h",
    });

    expect(systemMessage.providerOptions).toEqual({
      bedrock: { cachePoint: { type: "default" } },
    });
  });

  it("uses the bedrock cachePoint marker shape for bedrock", () => {
    const [systemMessage] = buildCachedSystemMessages({
      ...base,
      provider: "bedrock",
    });

    expect(systemMessage.providerOptions).toEqual({
      bedrock: { cachePoint: { type: "default" } },
    });
  });

  it.each([
    "openai",
    "azure",
    "google",
    "groq",
    "ollama",
  ])("leaves the system message unmarked for %s", (provider) => {
    const [systemMessage] = buildCachedSystemMessages({ ...base, provider });

    expect(systemMessage.providerOptions).toBeUndefined();
  });
});
