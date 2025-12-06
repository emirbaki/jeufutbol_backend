import { SearchTool } from '../src/insights/tools/search.tool';

async function main() {
    try {
        console.log('Creating SearchTool...');
        const tool = SearchTool.createTool();
        console.log('Tool created:', tool.name);

        const query = 'Galatasaray Samsunspor 5.12.2025 maçında golleri kim attı';
        console.log(`Invoking tool with query: "${query}"...`);

        // Wrapper expects an object matching the schema
        const result = await tool.invoke({ query });
        console.log('Result:', result);

        if (result && result.length > 0 && !result.startsWith('Error performing search')) {
            console.log('SUCCESS: Search returned results.');
        } else if (result.startsWith('Error performing search')) {
            console.log('WARNING: Search failed with handled error:', result);
        } else {
            console.log('WARNING: Search returned empty results.');
        }
    } catch (error) {
        console.error('ERROR:', error);
        // Don't fail the process for rate limit, just log it.
    }
}

main();
