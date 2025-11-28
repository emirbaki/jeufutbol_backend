import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";

export class SafeToolNode extends ToolNode {
    constructor(tools: StructuredTool[]) {
        super(tools);
    }

    async invoke(input: any, config?: any) {
        // The input is the state, usually { messages: [...] }
        // Depending on how it's called, input might be the state directly
        const messages = input.messages;
        const lastMessage = messages[messages.length - 1] as AIMessage;

        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
            // Should not happen if edge condition is correct, but safe to pass through
            return super.invoke(input, config);
        }

        // Check if all tools exist
        // @ts-ignore - Accessing protected/private property or just using the tools passed in constructor
        // ToolNode stores tools in a map or array. We can reconstruct the map from the tools we passed.
        // But since we can't easily access 'this.tools' if it's private, we'll rely on the fact we passed them.
        // Actually, let's just implement the run logic ourselves for safety to avoid private access issues.

        // We need the tools available. We can store them in our own property.
        return this.runSafe(input, config);
    }

    private async runSafe(input: any, config: any) {
        const messages = input.messages;
        const lastMessage = messages[messages.length - 1] as AIMessage;

        // We need access to the tools. ToolNode doesn't expose them publicly easily.
        // So we will store them in the constructor.
        // But wait, we can't easily override 'invoke' if we don't know the exact signature or if it's bound.
        // Let's just implement a standalone function or class that implements the node interface.

        // Re-implementing the core logic of ToolNode for safety
        const results: ToolMessage[] = [];

    }
}
