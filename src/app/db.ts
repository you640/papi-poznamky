import Dexie, { type Table } from 'dexie';

export interface Visit {
  id?: number;
  customerId: number;
  date: Date;
  service: string;
  price: number;
  note: string;
}

export interface FormulaEntry {
  id: string;
  date: Date | string;
  type: 'roots' | 'lengths' | 'full' | 'toner' | 'bleach' | 'custom';
  title?: string;
  formula: string;
  shades?: string[];
  developer?: string;
  ratio?: string;
  tags?: string[];
  note?: string;
}

export interface Customer {
  id?: number;
  name: string;
  lastName: string;
  phone: string;
  email?: string;
  lastVisit?: Date;
  tags: string[];
  notes?: string;
  formulas?: FormulaEntry[];
}

export class AppDB extends Dexie {
  customers!: Table<Customer, number>;
  visits!: Table<Visit, number>;

  constructor() {
    super('PapiHairDB');
    this.version(1).stores({
      customers: '++id, name, lastName, phone, *tags',
      visits: '++id, customerId, date'
    });
  }
}

export const db = new AppDB();
