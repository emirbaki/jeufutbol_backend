import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

export class SearchTool {
    static createTool() {
        const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';

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

                    // SearXNG JSON API endpoint
                    const response = await axios.get(`${searxngUrl}/search`, {
                        params: {
                            q: query,
                            format: 'json',
                            engines: 'google,bing,duckduckgo', // Use multiple engines for better results
                            language: 'tr-TR',
                        },
                        headers: {
                            'Accept': 'application/json, text/javascript, */*; q=0.01',
                            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-Forwarded-For': '127.0.0.1',
                            'X-Real-IP': '127.0.0.1',
                            'Referer': searxngUrl,
                        },
                        timeout: 15000, // 15 second timeout
                        validateStatus: () => true,
                    });

                    console.log(`[SearchTool] Response status: ${response.status}`);

                    if (response.status !== 200) {
                        console.error(`[SearchTool] Error response:`, response.data);
                        return `Search failed with status ${response.status}: ${response.statusText}`;
                    }

                    const data = response.data;

                    if (!data.results || data.results.length === 0) {
                        console.log(`[SearchTool] No results found`);
                        return 'No results found.';
                    }

                    console.log(`[SearchTool] Found ${data.results.length} results`);

                    // Extract and format the top 10 results
                    const results = data.results.slice(0, 10).map((result: any) => ({
                        title: result.title || '',
                        link: result.url || '',
                        snippet: result.content || '',
                        engine: result.engine || '',
                    }));

                    return JSON.stringify(results, null, 2);

                } catch (error) {
                    console.error(`[SearchTool] Error:`, error.message, error.code);
                    if (error.code === 'ECONNREFUSED') {
                        return `Error: Could not connect to SearXNG at ${searxngUrl}. Please check if the service is running.`;
                    }
                    if (error.code === 'ENOTFOUND') {
                        return `Error: Could not resolve SearXNG hostname. Please check the SEARXNG_URL environment variable.`;
                    }
                    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                        return `Error: Connection to SearXNG timed out. The server might be slow or unreachable.`;
                    }
                    return `Error performing search: ${error.message}`;
                }
            },
        });
    }
}
