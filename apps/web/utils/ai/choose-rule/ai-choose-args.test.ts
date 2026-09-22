import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import {
  getAction,
  getEmail,
  getEmailAccount,
  getRule,
} from "@/__tests__/helpers";
import { ActionType } from "@/generated/prisma/enums";

const generateObjectSpy = vi.fn();
const createGenerateObjectSpy = vi.fn(() => generateObjectSpy);

vi.mock("@/utils/llms", () => ({
  createGenerateObject: createGenerateObjectSpy,
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "anthropic",
    modelName: "claude-test",
    model: {},
    providerOptions: undefined,
  })),
}));

describe("aiGenerateArgs prompt composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateObjectSpy.mockResolvedValue({ object: {} });
  });

  it("opts the args call into system-prompt caching", async () => {
    await runGenerateArgs({ subject: "Hello" });

    expect(createGenerateObjectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cacheSystemPrompt: true }),
    );
  });

  it("keeps the system prompt identical across different emails and rules", async () => {
    await runGenerateArgs({
      subject: "First",
      ruleInstructions: "Reply to investment inquiries",
    });
    const first = capturedSystem();

    generateObjectSpy.mockClear();

    await runGenerateArgs({
      subject: "Second",
      ruleInstructions: "Acknowledge receipts",
    });

    expect(capturedSystem()).toBe(first);
  });

  it("keeps the volatile per-email context in the user prompt", async () => {
    await runGenerateArgs({ subject: "Quarterly invoice" });

    expect(capturedSystem()).not.toContain("Quarterly invoice");
    expect(capturedPrompt()).toContain("Quarterly invoice");
  });
});

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  with: vi.fn(() => noopLogger),
} as unknown as Logger;

async function runGenerateArgs({
  subject,
  ruleInstructions = "Reply to investment inquiries",
}: {
  subject: string;
  ruleInstructions?: string;
}) {
  const { aiGenerateArgs } = await import("./ai-choose-args");

  const action = getAction({
    type: ActionType.REPLY,
    content: "Dear {{write greeting}}, {{draft response}}",
  });

  await aiGenerateArgs({
    email: getEmail({ subject }),
    emailAccount: getEmailAccount(),
    selectedRule: getRule(ruleInstructions, [action]),
    parameters: [
      {
        actionId: action.id,
        type: action.type,
        parameters: z.object({
          content: z.object({ var1: z.string(), var2: z.string() }),
        }),
      },
    ],
    modelType: "default",
    logger: noopLogger,
  });
}

function capturedRequest(): { instructions: string; prompt: string } {
  const request = generateObjectSpy.mock.calls[0]?.[0];
  return { instructions: request?.instructions, prompt: request?.prompt };
}

function capturedSystem() {
  return capturedRequest().instructions;
}

function capturedPrompt() {
  return capturedRequest().prompt;
}
