import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class VisitPageTool {
    static createTool() {
        return new DynamicStructuredTool({
            name: 'visit_page',
            description: 'Visit a specific URL and extract its text content. Use this to read the full content of a search result link.',
            schema: z.object({
                url: z.string().describe('The URL to visit'),
            }),
            func: async ({ url }) => {
                try {
                    // Basic validation for protocol
                    if (!url.startsWith('http')) {
                        return 'Error: URL must start with http or https';
                    }

                    const response = await axios.get(url, {
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Accept':
                                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        },
                        timeout: 10000, // 10s timeout
                        maxRedirects: 5,
                        validateStatus: () => true,
                    });

                    if (response.status !== 200) {
                        return `Failed to load page. Status: ${response.status} ${response.statusText}`;
                    }

                    const $ = cheerio.load(response.data);

                    // Remove distracting elements
                    $('script, style, nav, footer, header, meta, noscript, svg, iframe').remove();

                    // Get text content
                    // We can use 'body' or typical main content containers
                    let text = $('body').text();

                    // Clean up whitespace
                    text = text.replace(/\s+/g, ' ').trim();

                    if (!text) {
                        return 'Page visited successfully but no text content was found.';
                    }

                    // Truncate to avoid context context overflow (e.g., 4000 chars)
                    const maxLength = 4000;
                    if (text.length > maxLength) {
                        text = text.substring(0, maxLength) + '... [Content Truncated]';
                    }

                    return text;

                } catch (error) {
                    return `Error visiting page: ${error.message}`;
                }
            },
        });
    }
}
