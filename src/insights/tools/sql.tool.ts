import { DataSource } from 'typeorm';
import { SqlDatabase } from '@langchain/classic/sql_db';
import { SqlToolkit } from '@langchain/classic/agents/toolkits/sql';

export class SqlTools {
  static async createTools(dataSource: DataSource, llm: any) {
    const db = await SqlDatabase.fromDataSourceParams({
      appDataSource: dataSource,
      includesTables: ['post', 'tweets', 'insights', 'monitored_profiles', 'tweet_monitored_profiles'],
    });

    const toolkit = new SqlToolkit(db, llm);
    return toolkit.getTools();
  }
}
