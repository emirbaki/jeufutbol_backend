import { search, SafeSearchType } from 'duck-duck-scrape';

async function main() {
    try {
        console.log('Testing duck-duck-scrape directly...');
        const query = 'test query';
        const results = await search(query, {
            safeSearch: SafeSearchType.MODERATE,
            locale: 'tr_TR',
        });
        console.log('Results found:', results.results.length);
        if (results.results.length > 0) {
            console.log('Result 1:', results.results[0].title);
        }
    } catch (error) {
        console.error('Direct test failed:', error);
    }
}

main();
