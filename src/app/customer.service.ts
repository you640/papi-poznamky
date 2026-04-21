import { Injectable, signal, computed } from '@angular/core';
import { db, type Customer, type Visit } from './db';
import { liveQuery } from 'dexie';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private customersList = signal<Customer[]>([]);
  searchQuery = signal('');

  filteredCustomers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const sorted = [...this.customersList()].sort((a, b) => 
      a.lastName.localeCompare(b.lastName)
    );

    if (!query) return sorted;

    return sorted.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.lastName.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      c.tags.some(t => t.toLowerCase().includes(query))
    );
  });

  constructor() {
    // Sync Dexie to Signal
    liveQuery(() => db.customers.toArray()).subscribe(c => {
      this.customersList.set(c);
      // Seed data if empty
      if (c.length === 0) {
        this.seedData();
      }
    });
  }

  async addCustomer(customer: Omit<Customer, 'id'>) {
    return await db.customers.add(customer as Customer);
  }

  async updateCustomer(id: number, changes: Partial<Customer>) {
    return await db.customers.update(id, changes);
  }

  async deleteCustomer(id: number) {
    return await db.customers.delete(id);
  }

  async getCustomerVisits(customerId: number) {
    return await db.visits.where('customerId').equals(customerId).reverse().sortBy('date');
  }

  async addVisit(visit: Omit<Visit, 'id'>) {
    const visitId = await db.visits.add(visit as Visit);
    // Update last visit date on customer
    await db.customers.update(visit.customerId, { lastVisit: visit.date });
    return visitId;
  }

  private async seedData() {
    const initialCustomers: Omit<Customer, 'id'>[] = [
      { name: 'Jozef', lastName: 'Mrkva', phone: '0901 123 456', tags: ['Pravidelný', 'Fade'], lastVisit: new Date('2024-03-15') },
      { name: 'Peter', lastName: 'Slanina', phone: '0905 555 666', tags: ['VIP', 'Brada'], lastVisit: new Date('2024-04-10') },
      { name: 'Andrej', lastName: 'Hruška', phone: '0911 222 333', tags: ['Novi'], lastVisit: new Date('2024-02-20') },
      { name: 'Michal', lastName: 'Zeler', phone: '0908 999 000', tags: ['Farbenie'], lastVisit: new Date('2024-03-30') },
      { name: 'Boris', lastName: 'Cibuľa', phone: '0944 111 222', tags: ['Fade', 'Junior'], lastVisit: new Date('2024-04-01') },
      { name: 'Adam', lastName: 'Jablko', phone: '0910 333 444', tags: ['Pravidelný'], lastVisit: new Date('2024-04-15') },
    ];

    for (const c of initialCustomers) {
      const id = await this.addCustomer(c);
      // Add fake visit
      if (c.lastVisit) {
        await this.addVisit({
          customerId: id,
          date: c.lastVisit,
          service: c.tags[0] || 'Strih',
          price: 25,
          note: 'Klasický strih, spokojnosť.'
        });
      }
    }
  }
}
