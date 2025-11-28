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
                return "Error: You attempted to call a tool named 'assistant'. Please do not do this. To reply to the user, just output your response as normal text.";
            },
        });
    }
}
