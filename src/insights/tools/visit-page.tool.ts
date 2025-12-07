import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class VisitPageTool {
    static createTool() {
        return new DynamicStructuredTool({
            name: 'visit_page',
            description: `Visit a URL and extract its full text content. YOU MUST USE THIS TOOL after web_search to get complete information.

Search results only provide snippets - they are NOT enough to answer detailed questions!

Use this tool to:
- Read full news articles
- Get detailed sports match reports (scores, goal scorers, minutes, lineups)
- Extract complete information from any webpage

If one page doesn't have the information you need, try visiting another URL from your search results.`,
            schema: z.object({
                url: z.string().describe('The full URL to visit (must start with http:// or https://)'),
            }),
            func: async ({ url }) => {
                try {
                    console.log(`[VisitPageTool] Visiting URL: ${url}`);

                    // Basic validation for protocol
                    if (!url.startsWith('http')) {
                        console.log(`[VisitPageTool] Invalid URL - missing http(s)`);
                        return 'Error: URL must start with http or https';
                    }

                    const response = await axios.get(url, {
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Accept':
                                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                        },
                        timeout: 15000, // 15s timeout
                        maxRedirects: 5,
                        validateStatus: () => true,
                    });

                    console.log(`[VisitPageTool] Response status: ${response.status}`);
                    console.log(`[VisitPageTool] Content-Type: ${response.headers['content-type']}`);
                    console.log(`[VisitPageTool] Raw content length: ${response.data?.length || 0} chars`);

                    if (response.status !== 200) {
                        console.log(`[VisitPageTool] Non-200 status, returning error`);
                        return `Failed to load page. Status: ${response.status} ${response.statusText}`;
                    }

                    const $ = cheerio.load(response.data);

                    // Remove distracting elements
                    $('script, style, nav, footer, header, meta, noscript, svg, iframe, aside, .ads, .advertisement').remove();

                    // Try to get main content first, fallback to body
                    let text = '';
                    const mainSelectors = ['article', 'main', '.content', '.post-content', '.article-body', '#content'];

                    for (const selector of mainSelectors) {
                        const content = $(selector).text();
                        if (content && content.trim().length > 100) {
                            text = content;
                            console.log(`[VisitPageTool] Found content in: ${selector}`);
                            break;
                        }
                    }

                    // Fallback to body if no main content found
                    if (!text) {
                        text = $('body').text();
                        console.log(`[VisitPageTool] Using full body text`);
                    }

                    // Clean up whitespace
                    text = text.replace(/\s+/g, ' ').trim();

                    console.log(`[VisitPageTool] Extracted text length: ${text.length} chars`);

                    if (!text) {
                        return 'Page visited successfully but no text content was found.';
                    }

                    // Truncate to avoid context overflow
                    const maxLength = 6000;
                    if (text.length > maxLength) {
                        text = text.substring(0, maxLength) + '... [Content Truncated]';
                        console.log(`[VisitPageTool] Content truncated to ${maxLength} chars`);
                    }

                    return text;

                } catch (error) {
                    console.error(`[VisitPageTool] Error:`, error.message, error.code);
                    if (error.code === 'ECONNREFUSED') {
                        return `Error: Connection refused to ${url}`;
                    }
                    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                        return `Error: Request timed out for ${url}`;
                    }
                    return `Error visiting page: ${error.message}`;
                }
            },
        });
    }
}
