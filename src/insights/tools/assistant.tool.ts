import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class AssistantTool {
  static createTool() {
    return new DynamicStructuredTool({
      name: 'assistant',
      description:
        'Do not use this tool. If you want to reply to the user, just output the text directly without calling any tool.',
      schema: z.object({}).passthrough(),
      func: async () => {
        return 'SYSTEM ERROR: You are incorrectly using a tool to reply. STOP CALLING TOOLS. Just output your answer as text immediately.';
      },
    });
  }
}

export class AssistantCommentaryTool {
  static createTool() {
    return new DynamicStructuredTool({
      name: 'assistant_commentary',
      description:
        'Do not use this tool. If you want to reply to the user, just output the text directly without calling any tool.',
      schema: z.object({}).passthrough(),
      func: async () => {
        return 'SYSTEM ERROR: You are incorrectly using a tool to reply. STOP CALLING TOOLS. Just output your answer as text immediately.';
      },
    });
  }
}
