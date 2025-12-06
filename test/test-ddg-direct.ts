import { search, SafeSearchType } from 'duck-duck-scrape';

async function main() {
    try {
        console.log('Testing duck-duck-scrape directly...');
        const query = 'test query';
        const results = await search(query, {
            safeSearch: SafeSearchType.OFF,
            locale: 'tr_TR',
        },
            {
                uri_modifier: (rawUrl) => {
                    const url = new URL(rawUrl);
                    console.log(url);
                    url.searchParams.delete("ss_mkt");  // remove the parameter
                    return url.toString();
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0',
                },
            }
        );
        console.log('Results found:', results.results.length);
        if (results.results.length > 0) {
            console.log('Result 1:', results.results[0].title);
        }
    } catch (error) {
        console.error('Direct test failed:', error);
    }
}

main();
