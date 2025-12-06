import { VisitPageTool } from '../src/insights/tools/visit-page.tool';

async function main() {
    try {
        console.log('Creating VisitPageTool...');
        const tool = VisitPageTool.createTool();

        // Use a reliable test URL
        const url = 'https://spor.haber7.com/galatasaray/haber/3585505-samsunspor-2-0dan-dondu-galatasaray-osimhenle-hayata-tutundu';
        console.log(`Visiting URL: ${url}...`);

        const result = await tool.invoke({ url });
        console.log('--- Result Content ---');
        console.log(result);
        console.log('----------------------');

        if (result && result.includes('Example Domain')) {
            console.log('SUCCESS: Page content retrieved.');
        } else {
            console.log('WARNING: Unexpected content.');
        }

    } catch (error) {
        console.error('ERROR:', error);
    }
}

main();
