import { DynamicStructuredTool } from '@langchain/core/tools';
import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { z } from 'zod';

export class SearchTool {
    static createTool() {
        const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';

        // Create the official SearxngSearch instance
        const searxngTool = new SearxngSearch({
            apiBase: searxngUrl,
            params: {
                format: 'json',
                engines: 'google', //bing,brave,qwant,duckduckgo
                categories: 'general,news',
                // language: 'tr-TR',
                // time_range: 'month',
                safesearch: 0,
            },
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        // Wrap in DynamicStructuredTool for better control
        return new DynamicStructuredTool({
            name: 'web_search',
            description: `Search the web for current information. YOU MUST USE THIS TOOL when the user asks about:
- Recent events, news, or current affairs
- Sports scores, match results, or game details
- Stock prices, cryptocurrency, or financial data
- Weather forecasts
- Any information from the past year that requires up-to-date data
- When user mentions "today", "yesterday", "this week", "recently", "latest"

IMPORTANT: Always include relevant dates in your search query to get accurate results.
After searching, you MUST use the visit_page tool to read full content from the result URLs.`,
            schema: z.object({
                query: z.string().describe('The search query - include dates for time-sensitive topics'),
            }),
            func: async ({ query }) => {
                try {
                    console.log(`[SearchTool] Searching for: "${query}" via SearXNG at ${searxngUrl}`);

                    const result = await searxngTool.invoke(query);

                    console.log(`[SearchTool] Got result (${typeof result}):`,
                        typeof result === 'string' ? result.substring(0, 200) + '...' : result);

                    return result;
                } catch (error: any) {
                    console.error(`[SearchTool] Error:`, error.message);

                    if (error.code === 'ECONNREFUSED') {
                        return `Error: Could not connect to SearXNG at ${searxngUrl}. Please check if the service is running.`;
                    }
                    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
                        return `Error: Connection to SearXNG timed out. The server might be slow or unreachable.`;
                    }

                    return `Error performing search: ${error.message}`;
                }
            },
        });
    }
}
