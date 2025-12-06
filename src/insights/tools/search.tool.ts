import { DuckDuckGoSearch, SafeSearchType } from '@langchain/community/tools/duckduckgo_search';

export class SearchTool {
    static createTool() {
        return new DuckDuckGoSearch({
            maxResults: 1,
            searchOptions: {
                safeSearch: SafeSearchType.MODERATE,
                locale: 'tr_TR',
            },
            defaultConfig: {

            }
        });
    }
}
