import { SearchTool } from '../src/insights/tools/search.tool';

async function main() {
    try {
        console.log('Creating SearchTool...');
        const tool = SearchTool.createTool();
        console.log('Tool created:', tool.name);

        const query = 'LangChain DuckDuckGo search tool';
        console.log(`Invoking tool with query: "${query}"...`);

        const result = await tool.invoke(query);
        console.log('Result:', result);

        if (result && result.length > 0) {
            console.log('SUCCESS: Search returned results.');
        } else {
            console.error('FAILURE: Search returned empty results.');
            process.exit(1);
        }
    } catch (error) {
        console.error('ERROR:', error);
        process.exit(1);
    }
}

main();
