import { Injectable, signal, computed } from '@angular/core';
import { db, type Customer, type Visit } from './db';
import { liveQuery } from 'dexie';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  customersList = signal<Customer[]>([]);
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
      const dontReseed = typeof localStorage !== 'undefined' && localStorage.getItem('dont_reseed_after_wipe') === 'true';
      // Seed data if empty, not already seeding, and not blocked by explicit user wipe
      if (c.length === 0 && !this.isSeeding && !dontReseed) {
        this.isSeeding = true;
        try {
          await this.seedData();
        } finally {
          this.isSeeding = false;
        }
      }
    });
  }

  async wipeAllData() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dont_reseed_after_wipe', 'true');
    }
    this.isSeeding = true;
    try {
      await db.visits.clear();
      await db.customers.clear();
      this.customersList.set([]);
    } finally {
      this.isSeeding = false;
    }
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

  async exportToCSV(filters: { tag: string }) {
    const customers = await db.customers.toArray();
    const visits = await db.visits.toArray();

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
    // Force clear old mock data and set a fresh deployment key
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('did_clear_everything_except_one_vzor_v4')) {
       await db.customers.clear();
       await db.visits.clear();
       localStorage.setItem('did_clear_everything_except_one_vzor_v4', 'true');
    }

    const count = await db.customers.count();
    if (count > 0) {
       return;
    }

    const initialCustomers: Omit<Customer, 'id'>[] = [
      { 
        name: 'Jozef', 
        lastName: 'Mrkva', 
        phone: '0911 222 333', 
        tags: ['VIP', 'Farbenie', 'Brada'], 
        lastVisit: new Date('2026-06-12T10:00:00Z') 
      }
    ];

    for (const c of initialCustomers) {
      const id = await this.addCustomer(c);
      // Add one default visit
      if (c.lastVisit) {
        await this.addVisit({
          customerId: id,
          date: c.lastVisit,
          service: 'Strih + Farbenie + Brada',
          price: 35,
          note: 'Prvotriedny servis, upravená brada a svieža farba podľa požiadaviek.'
        });
      }
    }
  }
}
