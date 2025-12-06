import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class SearchTool {
    static createTool() {
        return new DynamicStructuredTool({
            name: 'duckduckgo_search',
            description: 'Search the web using DuckDuckGo. Use this tool when you need to find current information, news, or facts from the internet.',
            schema: z.object({
                query: z.string().describe('The search query'),
            }),
            func: async ({ query }) => {
                try {
                    const response = await axios.get('https://html.duckduckgo.com/html/', {
                        params: {
                            q: query,
                            kl: 'tr-tr', // Region: Turkey  
                        },
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Accept':
                                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                            'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
                            'Referer': 'https://html.duckduckgo.com/',
                            'Upgrade-Insecure-Requests': '1',
                        },
                        validateStatus: () => true, // Don't throw on 4xx/5xx to handle errors manually
                    });

                    if (response.status !== 200) {
                        return `Search failed with status ${response.status}: ${response.statusText}`;
                    }

                    const $ = cheerio.load(response.data);
                    const results: { title: string; link: string; snippet: string }[] = [];

                    // DuckDuckGo HTML structure usually has results in .result
                    $('.result').each((i, element) => {
                        if (i >= 10) return; // Limit to 5 results

                        const titleElement = $(element).find('.result__title .result__a');
                        const snippetElement = $(element).find('.result__snippet');

                        const title = titleElement.text().trim();
                        const link = titleElement.attr('href');
                        const snippet = snippetElement.text().trim();

                        if (title && link) {
                            results.push({ title, link, snippet });
                        }
                    });

                    if (results.length === 0) {
                        // Check for captcha or other blocks
                        if (response.data.includes('anomalyDetectionBlock') || response.data.includes('If this error persists')) {
                            return 'Error: DuckDuckGo blocked the request (bot detection).';
                        }
                        return 'No results found.';
                    }

                    return JSON.stringify(results, null, 2);

                } catch (error) {
                    return `Error performing search: ${error.message}`;
                }
            },
        });
    }
}
