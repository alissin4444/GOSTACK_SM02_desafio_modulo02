import { getCustomRepository, getRepository, In } from 'typeorm';
import fs from 'fs';
import csv from 'csv-parser';

import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';
import Transaction from '../models/Transaction';

interface TransactionI {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category_id?: string;
  category?: string;
}

interface CategoryI {
  title: string;
}

class ImportTransactionsService {
  async execute(filepath: string): Promise<Transaction[]> {
    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const readStream = fs.createReadStream(filepath);

    const CSV = readStream.pipe(csv());

    const CSVTransactions: TransactionI[] = [];
    const CSVCategories: CategoryI[] = [];

    await new Promise(resolve => {
      CSV.on('data', line => {
        const [title, type, value, category] = Object.keys(
          line,
        ).map((cell: string) => line[cell].trim());

        if (!title || !type || !value) return;

        CSVTransactions.push({ title, type, value, category });

        CSVCategories.push({ title: category });
      }).on('end', () => resolve());
    });

    const categoriesAlreadyCreated: Category[] = await categoriesRepository.find(
      {
        where: {
          title: In(CSVCategories.map(category => category.title)),
        },
      },
    );

    const categoriesTitleAlreadyCreated = categoriesAlreadyCreated.map(
      category => category.title,
    );

    const categoriesToCreate: CategoryI[] = CSVCategories.filter(
      category => !categoriesTitleAlreadyCreated.includes(category.title),
    ).filter(
      (thing, index, self) =>
        index === self.findIndex(category => category.title === thing.title),
    );

    const categoriesCreated: Category[] = categoriesRepository.create(
      categoriesToCreate,
    );

    await categoriesRepository.save(categoriesCreated);

    const categories = [...categoriesAlreadyCreated, ...categoriesCreated];

    const transactions = transactionsRepository.create(
      CSVTransactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category_id: categories.find(
          category => category.title === transaction.category,
        )?.id,
      })),
    );

    await transactionsRepository.save(transactions);

    await fs.promises.unlink(filepath);

    return transactions;
  }
}

export default ImportTransactionsService;
