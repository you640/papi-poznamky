import { Injectable, signal, computed } from '@angular/core';
import { db, type Customer, type Visit } from './db';
import { liveQuery } from 'dexie';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private customersList = signal<Customer[]>([]);
  searchQuery = signal('');
  private isSeeding = false;

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
    liveQuery(() => db.customers.toArray()).subscribe(async c => {
      this.customersList.set(c);
      // Seed data if empty and not already seeding
      if (c.length === 0 && !this.isSeeding) {
        this.isSeeding = true;
        try {
          await this.seedData();
        } finally {
          this.isSeeding = false;
        }
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

  async getAllVisitsWithCustomers() {
    const visits = await db.visits.orderBy('date').reverse().toArray();
    const customers = await db.customers.toArray();
    const customerMap = new Map(customers.map(c => [c.id, c]));
    
    return visits.map(v => ({
      ...v,
      customer: customerMap.get(v.customerId)!
    }));
  }

  async addVisit(visit: Omit<Visit, 'id'>) {
    const visitId = await db.visits.add(visit as Visit);
    // Update last visit date on customer
    await db.customers.update(visit.customerId, { lastVisit: visit.date });
    return visitId;
  }

  async updateVisit(id: number, changes: Partial<Visit>) {
    return await db.visits.update(id, changes);
  }

  async exportToCSV(filters: { dateFrom: string, dateTo: string, tag: string }) {
    const customers = await db.customers.toArray();
    let visits = await db.visits.toArray();

    // 1. Date filters on visits
    if (filters.dateFrom) {
      const fd = new Date(filters.dateFrom);
      fd.setHours(0, 0, 0, 0);
      visits = visits.filter(v => new Date(v.date) >= fd);
    }
    if (filters.dateTo) {
      const td = new Date(filters.dateTo);
      td.setHours(23, 59, 59, 999);
      visits = visits.filter(v => new Date(v.date) <= td);
    }

    // 2. Format as flat table Array
    const rows = [];
    // Header
    rows.push(['Zákazník', 'Telefón', 'Tagy', 'Dátum Návštevy', 'Služba', 'Cena (€)', 'Poznámka Návštevy', 'Poznámka Zákazníka']);

    for (const customer of customers) {
      // 3. Tag filter
      if (filters.tag) {
        const lowerTag = filters.tag.toLowerCase().trim();
        const hasTag = customer.tags.some(t => t.toLowerCase().includes(lowerTag));
        if (!hasTag) continue;
      }

      const cVisits = visits.filter(v => v.customerId === customer.id);
      
      const escapeCSV = (val: string | number | undefined | null) => {
        if (val == null) return '""';
        const str = String(val).replace(/"/g, '""'); // Escaping double quotes
        return `"${str}"`;
      };

      const custName = escapeCSV(`${customer.name} ${customer.lastName}`);
      const custPhone = escapeCSV(customer.phone);
      const custTags = escapeCSV(customer.tags.join(', '));
      const custNotes = escapeCSV(customer.notes);

      if (cVisits.length > 0) {
        cVisits.forEach(v => {
          const vDate = escapeCSV(new Date(v.date).toLocaleDateString('sk-SK'));
          const vService = escapeCSV(v.service);
          const vPrice = escapeCSV(v.price);
          const vNote = escapeCSV(v.note);
          rows.push([custName, custPhone, custTags, vDate, vService, vPrice, vNote, custNotes]);
        });
      } else {
        // Only include customers with no visits in range IF date range wasn't strict
        // Or include them explicitly so user gets full filtered base
        // We will include them but with empty visit data
        rows.push([custName, custPhone, custTags, '""', '""', '""', '""', custNotes]);
      }
    }

    // Build the csv string
    const csvContent = rows.map(r => r.join(',')).join('\n');
    
    // Trigger download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel encoding
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `px-crm-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  private async seedData() {
    // Double check to avoid race conditions
    const count = await db.customers.count();
    if (count > 0) return;
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
