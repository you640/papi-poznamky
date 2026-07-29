import { Injectable, signal, computed } from '@angular/core';
import { db, type Customer, type Visit, type FormulaEntry } from './db';
import { liveQuery } from 'dexie';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  customersList = signal<Customer[]>([]);
  searchQuery = signal('');
  visitCounts = signal<Record<number, number>>({});
  sortBy = signal<'alphabetical' | 'lastVisit' | 'mostFrequent'>('alphabetical');
  private isSeeding = false;

  filteredCustomers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    let result = [...this.customersList()];

    if (query) {
      result = result.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.lastName.toLowerCase().includes(query) ||
        c.phone.includes(query) ||
        (c.notes || '').toLowerCase().includes(query) ||
        c.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    const mode = this.sortBy();
    if (mode === 'lastVisit') {
      result.sort((a, b) => {
        const timeA = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
        const timeB = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return a.lastName.localeCompare(b.lastName);
      });
    } else if (mode === 'mostFrequent') {
      result.sort((a, b) => {
        const countA = this.visitCounts()[a.id!] || 0;
        const countB = this.visitCounts()[b.id!] || 0;
        if (countA !== countB) return countB - countA;
        return a.lastName.localeCompare(b.lastName);
      });
    } else {
      result.sort((a, b) => {
        const cmp = a.lastName.localeCompare(b.lastName);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      });
    }

    return result;
  });

  getVisitCount(customerId: number | undefined): number {
    if (!customerId) return 0;
    return this.visitCounts()[customerId] || 0;
  }

  constructor() {
    // Sync Dexie to Signal reactively (both customers and visits)
    liveQuery(async () => {
      const customers = await db.customers.toArray();
      const visits = await db.visits.toArray();
      const counts: Record<number, number> = {};
      for (const v of visits) {
        if (v.customerId) {
          counts[v.customerId] = (counts[v.customerId] || 0) + 1;
        }
      }
      return { customers, counts };
    }).subscribe(async ({ customers, counts }) => {
      this.visitCounts.set(counts);
      this.customersList.set(customers);
      
      const dontReseed = typeof localStorage !== 'undefined' && localStorage.getItem('dont_reseed_after_wipe') === 'true';
      // Seed data if empty and not already seeding
      if (customers.length === 0 && !this.isSeeding && !dontReseed) {
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
    const newCust = customer as Customer;
    const id = await db.customers.add(newCust);
    const created = { ...newCust, id };
    this.customersList.update(list => {
      if (list.some(c => c.id === id)) return list;
      return [...list, created];
    });
    return id;
  }

  findPotentialDuplicates(name: string, lastName: string, phone?: string, excludeId?: number): Customer[] {
    const normName = this.normalizeNameStr(name);
    const normLast = this.normalizeNameStr(lastName);
    const normPhone = this.normalizePhone(phone);

    return this.customersList().filter(c => {
      if (excludeId && c.id === excludeId) return false;
      
      const cName = this.normalizeNameStr(c.name);
      const cLast = this.normalizeNameStr(c.lastName);
      const cPhone = this.normalizePhone(c.phone);

      // Check phone match
      if (normPhone && cPhone && normPhone.length >= 6 && normPhone === cPhone) return true;

      // Check full name match
      if (normName && normLast && cName === normName && cLast === normLast) return true;

      // Check single name match if either last name is empty
      if (normName && !normLast && !cLast && cName === normName) return true;

      return false;
    });
  }

  /**
   * Helper to normalize phone numbers for comparison
   */
  normalizePhone(phone?: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+421')) {
      cleaned = '0' + cleaned.substring(4);
    }
    return cleaned;
  }

  /**
   * Helper to normalize names (strips accents, lowercases, trims)
   */
  normalizeNameStr(str?: string): string {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Finds all duplicate groups across the database based on phone numbers and names
   */
  async findDuplicateGroups(): Promise<Customer[][]> {
    const allCustomers = await db.customers.toArray();
    const visitedIds = new Set<number>();
    const groups: Customer[][] = [];

    for (let i = 0; i < allCustomers.length; i++) {
      const c1 = allCustomers[i];
      if (!c1.id || visitedIds.has(c1.id)) continue;

      const group: Customer[] = [c1];
      const p1 = this.normalizePhone(c1.phone);
      const fn1 = this.normalizeNameStr(c1.name);
      const ln1 = this.normalizeNameStr(c1.lastName);

      for (let j = i + 1; j < allCustomers.length; j++) {
        const c2 = allCustomers[j];
        if (!c2.id || visitedIds.has(c2.id)) continue;

        const p2 = this.normalizePhone(c2.phone);
        const fn2 = this.normalizeNameStr(c2.name);
        const ln2 = this.normalizeNameStr(c2.lastName);

        let isMatch = false;

        // Match 1: Phone numbers match (if valid phone with >= 6 digits)
        if (p1 && p2 && p1.length >= 6 && p1 === p2) {
          isMatch = true;
        }

        // Match 2: Full name matches exactly
        if (!isMatch && fn1 && fn2 && fn1 === fn2) {
          if (ln1 && ln2 && ln1 === ln2) {
            isMatch = true;
          } else if (!ln1 && !ln2) {
            isMatch = true;
          }
        }

        // Match 3: Swapped first/last name
        if (!isMatch && fn1 && ln1 && fn2 && ln2 && fn1 === ln2 && ln1 === fn2) {
          isMatch = true;
        }

        if (isMatch) {
          group.push(c2);
        }
      }

      if (group.length > 1) {
        group.forEach(c => visitedIds.add(c.id!));
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Merges duplicate customer records into primary record, re-linking visits and combining metadata
   */
  async mergeDuplicateGroup(primaryId: number, duplicateIds: number[]): Promise<{ reassignedVisits: number }> {
    let reassignedVisitsCount = 0;

    const primary = await db.customers.get(primaryId);
    if (!primary) return { reassignedVisits: 0 };

    const duplicates = await db.customers.bulkGet(duplicateIds);
    const validDuplicates = duplicates.filter((d): d is Customer => !!d && d.id !== primaryId);

    if (validDuplicates.length === 0) return { reassignedVisits: 0 };

    // 1. Gather all tags
    const allTagsSet = new Set<string>(primary.tags || []);
    validDuplicates.forEach(d => {
      (d.tags || []).forEach(t => allTagsSet.add(t));
    });

    // 2. Gather non-duplicate notes
    const existingNotes = (primary.notes || '').trim();
    const notesParts: string[] = existingNotes ? [existingNotes] : [];
    validDuplicates.forEach(d => {
      const dNote = (d.notes || '').trim();
      if (dNote && !notesParts.some(np => np.includes(dNote) || dNote.includes(np))) {
        notesParts.push(dNote);
      }
    });

    // 3. Gather formulas
    const formulaMap = new Map<string, FormulaEntry>();
    (primary.formulas || []).forEach(f => formulaMap.set(f.id, f));
    validDuplicates.forEach(d => {
      (d.formulas || []).forEach(f => {
        if (!formulaMap.has(f.id)) {
          formulaMap.set(f.id, f);
        }
      });
    });

    // 4. Fill missing phone, email, photo, name
    let phone = primary.phone || '';
    let email = primary.email || '';
    let photo = primary.photo || '';
    let name = primary.name || '';
    let lastName = primary.lastName || '';

    validDuplicates.forEach(d => {
      if (!phone && d.phone) phone = d.phone;
      if (!email && d.email) email = d.email;
      if (!photo && d.photo) photo = d.photo;
      if (!lastName && d.lastName) lastName = d.lastName;
      if (name.length < (d.name || '').length) name = d.name;
    });

    // 5. Pick latest lastVisit date
    let lastVisit = primary.lastVisit ? new Date(primary.lastVisit) : undefined;
    validDuplicates.forEach(d => {
      if (d.lastVisit) {
        const dDate = new Date(d.lastVisit);
        if (!lastVisit || dDate > lastVisit) {
          lastVisit = dDate;
        }
      }
    });

    const validDupIds = validDuplicates.map(d => d.id!).filter(Boolean);

    // Reassign visits for all duplicate customers to primaryId
    for (const dupId of validDupIds) {
      const count = await db.visits.where('customerId').equals(dupId).modify({ customerId: primaryId });
      reassignedVisitsCount += count;
    }

    // Update primary customer with consolidated data
    await db.customers.update(primaryId, {
      name,
      lastName,
      phone,
      email,
      photo,
      tags: Array.from(allTagsSet),
      notes: notesParts.join(' | '),
      formulas: Array.from(formulaMap.values()),
      lastVisit
    });

    // Delete duplicate customer records
    await db.customers.bulkDelete(validDupIds);

    return { reassignedVisits: reassignedVisitsCount };
  }

  /**
   * Cleanup operation that scans for duplicates and merges them automatically, maintaining data integrity
   */
  async cleanupDuplicates(): Promise<{ mergedGroupsCount: number; removedDuplicatesCount: number; reassignedVisitsCount: number }> {
    const duplicateGroups = await this.findDuplicateGroups();
    let mergedGroupsCount = 0;
    let removedDuplicatesCount = 0;
    let totalReassignedVisits = 0;

    for (const group of duplicateGroups) {
      if (group.length < 2) continue;

      // Select primary: the record with the most complete info or lowest id
      const sorted = [...group].sort((a, b) => {
        const scoreA = (a.photo ? 5 : 0) + (a.email ? 3 : 0) + (a.phone ? 3 : 0) + (a.notes ? 2 : 0) + (a.formulas?.length || 0);
        const scoreB = (b.photo ? 5 : 0) + (b.email ? 3 : 0) + (b.phone ? 3 : 0) + (b.notes ? 2 : 0) + (b.formulas?.length || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.id || 0) - (b.id || 0);
      });

      const primary = sorted[0];
      const dupIds = sorted.slice(1).map(c => c.id!).filter(Boolean);

      const res = await this.mergeDuplicateGroup(primary.id!, dupIds);
      mergedGroupsCount++;
      removedDuplicatesCount += dupIds.length;
      totalReassignedVisits += res.reassignedVisits;
    }

    return {
      mergedGroupsCount,
      removedDuplicatesCount,
      reassignedVisitsCount: totalReassignedVisits
    };
  }

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  setSearchQueryDebounced(query: string, delay = 150) {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchQuery.set(query);
    }, delay);
  }

  async updateCustomer(id: number, changes: Partial<Customer>) {
    this.customersList.update(list =>
      list.map(c => c.id === id ? { ...c, ...changes } : c)
    );
    return await db.customers.update(id, changes);
  }

  async deleteCustomer(id: number) {
    this.customersList.update(list => list.filter(c => c.id !== id));
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
    if (visit.customerId) {
      this.visitCounts.update(counts => ({
        ...counts,
        [visit.customerId]: (counts[visit.customerId] || 0) + 1
      }));
      this.customersList.update(list =>
        list.map(c => c.id === visit.customerId ? { ...c, lastVisit: visit.date } : c)
      );
    }
    const visitId = await db.visits.add(visit as Visit);
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

  async forceReloadDefaultClients() {
    await db.customers.clear();
    await db.visits.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('dont_reseed_after_wipe');
      localStorage.setItem('did_seed_hair_clients_v11', 'true');
    }
    await this.seedData(true);
  }

  private async seedData(force = false) {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('did_seed_hair_clients_v11')) {
       await db.customers.clear();
       await db.visits.clear();
       localStorage.setItem('did_seed_hair_clients_v11', 'true');
       force = true;
    }

    const count = await db.customers.count();
    if (count > 20 && !force) {
       return;
    }

    const initialCustomers: Omit<Customer, 'id'>[] = [
      { name: 'Sofia', lastName: 'Jakubová', phone: '', tags: ['Farbenie'], notes: 'K: 6,1 - 6,14 - 5,00 | D: 7,1 - 6,14' },
      { name: 'Karin', lastName: 'K.', phone: '', tags: ['Farbenie'], notes: 'K: 6.00 - 7 | D: 7.21' },
      { name: 'Kimáková', lastName: '', phone: '', tags: ['Medená', 'Farbenie'], notes: 'K: 6 (červená-medená) | NOVÁ: 7 plus 6.34 | Variant: Recept 6, 6.4' },
      { name: 'Simona', lastName: 'Hričková', phone: '', tags: ['Farbenie'], notes: 'Recept: 6.00, 6.1' },
      { name: 'Michaela', lastName: 'Wolczková', phone: '', tags: ['Farbenie', 'Tónovanie'], notes: 'K: 7.21 | S: 7.21 - 9.21 | D: 9.21' },
      { name: 'Lívia', lastName: 'Liptajová', phone: '', tags: ['Farbenie'], notes: 'Recept: 3 - 4' },
      { name: 'V.', lastName: 'Rusnáková', phone: '', tags: ['Farbenie'], notes: 'Recept: 3 - 1,1' },
      { name: 'Jana', lastName: 'Okarajošová', phone: '', tags: ['Farbenie'], notes: 'Recept: 7.21' },
      { name: 'Anna', lastName: 'Mačková', phone: '', tags: ['Tónovanie'], notes: 'Tonovačka: 7,21 - 10.22 - 0.11' },
      { name: 'Peťa', lastName: 'Autoškola', phone: '', tags: ['Farbenie'], notes: 'K: 5-6 green | D: 5.32 green' },
      { name: 'Forgáčová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 7 | D: 8.31' },
      { name: 'Alexandra', lastName: 'Olejová', phone: '', tags: ['Farbenie'], notes: 'K: 7,13 | D: 7,13' },
      { name: 'Hufnagelová', lastName: '', phone: '', tags: ['Tónovanie', 'Blond'], notes: 'Toner: 7,14 + 7,21 (chce svetlejšiu)' },
      { name: 'Gabriela', lastName: 'Rosič', phone: '0908343587', tags: ['Farbenie'], notes: 'K: 5 + 6,3 kombinovanie s 9,31' },
      { name: 'Xénia', lastName: '', phone: '', tags: ['Farbenie'], notes: 'Celé vlasy: 7.3, 7.13, trošku 7.00' },
      { name: 'Halpelka', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 6-7 | D: 7.21' },
      { name: 'Grančová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5.00 + kvapka 1 | Alt: K: 4' },
      { name: 'Medvedová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 7 | Alt: K: 7,31' },
      { name: 'Ernstová', lastName: '', phone: '', tags: ['Blond', 'Zosvetľovanie'], notes: 'Recept: 11,02 + 000ss + 12% oxi' },
      { name: 'Delfíniová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5 + 5,3 | D: 6,3' },
      { name: 'Janka', lastName: 'Karajošová', phone: '', tags: ['Blond', 'Tónovanie'], notes: 'Recept: 10.21 + 9.21' },
      { name: 'Petrana', lastName: 'Krupášová', phone: '', tags: ['Farbenie'], notes: 'Celé vlasy: 9.1 - 7.21' },
      { name: 'Lašeníková', lastName: '', phone: '', tags: ['Tónovanie', 'Blond'], notes: 'Ton: 9,00 + 8,2 + 7 + 0,22' },
      { name: 'Katka', lastName: 'Daňová', phone: '', tags: ['Farbenie'], notes: 'K: 5 | D: 7,32 + 8,31' },
      { name: 'Vierka', lastName: 'Nováčany', phone: '', tags: ['Farbenie'], notes: 'Celá hlava: 7.00, 6.14' },
      { name: 'Lenka', lastName: 'Kudelová', phone: '', tags: ['Farbenie'], notes: 'Recept: 5 - 6.15 - green' },
      { name: 'Nikola', lastName: 'Jarošová', phone: '', tags: ['Farbenie', 'Medená'], notes: 'K: 6.34 | D: 7.34, 9.3 (pôl na pôl)' },
      { name: 'Kordovánová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5 + 6,00 + 6,35 | D: 6,35 + 6,00' },
      { name: 'Laura', lastName: 'Tigrovaná', phone: '', tags: ['Tmavá'], notes: 'K: 3' },
      { name: 'Magdaléna', lastName: 'Rusnáková', phone: '', tags: ['Farbenie'], notes: 'K: 7,32 + 6 | D: 7,35' },
      { name: 'Sandra', lastName: 'Horváthová Kapel', phone: '', tags: ['Farbenie'], notes: 'K: 5 + 5,32 | D: 5,32' },
      { name: 'Gálová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5 | D: 7,32 + 8,31' },
      { name: 'Mariana', lastName: 'Mačáková', phone: '', tags: ['Farbenie'], notes: 'K: 4 (3% oxidant) | Tonovačka: -3' },
      { name: 'Lucia', lastName: 'Kramarčíková', phone: '', tags: ['Farbenie'], notes: 'Celé vlasy: 5 (30g) + 5.1 (10g) + 3 (10g)' },
      { name: 'Viera', lastName: 'Kurucová', phone: '', tags: ['Blond'], notes: 'Recept: 9.3' },
      { name: 'Lívia', lastName: 'Kučeravá', phone: '', tags: ['Blond', 'Zosvetľovanie'], notes: 'Recept: 11,21 (25g) + 11 (10g) + 7,21 (5g)' },
      { name: 'Matisová', lastName: '', phone: '0915962676', tags: ['Tmavá'], notes: 'K: 3' },
      { name: 'Natália', lastName: 'Szetmerová', phone: '', tags: ['Farbenie'], notes: 'K: 4 | D: 7,4 + 5,17' },
      { name: 'Zuzka', lastName: 'Gumanová', phone: '', tags: ['Farbenie'], notes: 'Recept: 6 + 6,1 + 5 + Green + 0,02' },
      { name: 'Gumanová', lastName: 'Mama', phone: '', tags: ['Blond', 'Tónovanie'], notes: 'Recept: 10,21 (20g) + 10,1 (5g) + 0,11 (5g)' },
      { name: 'Daniela', lastName: 'Michalíková', phone: '', tags: ['Farbenie'], notes: 'K: 5' },
      { name: 'Ondrušová', lastName: '', phone: '', tags: ['Blond'], notes: 'K: 6,00 | D: 11,02 + 11,31' },
      { name: 'Paťa', lastName: 'Alex', phone: '', tags: ['Farbenie'], notes: 'K: 5,1 | D: 6,1' },
      { name: 'Goliašová', lastName: '', phone: '', tags: ['Tmavá'], notes: 'K: 4' },
      { name: 'Zuzka', lastName: 'Zákaz', phone: '', tags: ['Blond', 'Tónovanie'], notes: 'D: 9,21' },
      { name: 'Nika', lastName: 'Spišská', phone: '', tags: ['Farbenie'], notes: 'K: 4-5 | D: 6-6,1' },
      { name: 'Suseda', lastName: 'Nováčany', phone: '', tags: ['Farbenie'], notes: 'K: 7,8 + 5 | D: 7,18' },
      { name: 'Čisláková', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5,4 - 0,5 | D: 8 - 0,5' },
      { name: 'Tokárová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 4 | D: 6,1' },
      { name: 'Jarek', lastName: 'Mama', phone: '', tags: ['Blond'], notes: 'K: 9,3' },
      { name: 'Nalevanková', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 4 | D: 6,14 - 6,3' },
      { name: 'Silvia', lastName: 'Mangerová', phone: '', tags: ['Farbenie'], notes: 'K-D: 6 + 7,1' },
      { name: 'Anička', lastName: 'Hreňová', phone: '', tags: ['Farbenie'], notes: 'Recept: 8,13 + KVAPKA 8' },
      { name: 'Huská', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 7 + 8,13 | D: 8,13' },
      { name: 'Jana', lastName: 'Kovalčíková', phone: '', tags: ['Farbenie'], notes: 'K: 4 | D: 6,5' },
      { name: 'Kačička', lastName: 'Mama', phone: '', tags: ['Blond', 'Melír'], notes: 'Recept: 10,21 | Melír 12%' },
      { name: 'Mama Flip', lastName: 'Duda', phone: '', tags: ['Farbenie'], notes: 'K: 6,14 + 6 | D: 7,21' },
      { name: 'Anička', lastName: '', phone: '', tags: ['Blond'], notes: 'K: 8,13 + 8 (9%) | D: 9,13 (3%) | NOVÁ: 9,21 + 8,1' },
      { name: 'Saša', lastName: 'Jaja', phone: '', tags: ['Blond'], notes: 'K: 9,1' },
      { name: 'Winkelnesová', lastName: '', phone: '', tags: ['Blond'], notes: 'K: 4-5 | D: 9,21 (10g) + 10,21 (20g) + 11,02 (20g)' },
      { name: 'Daniela', lastName: 'Jarošová', phone: '', tags: ['Tónovanie', 'Blond'], notes: 'Tonovačka: 11,02 (20g) + 4,00 (5g) + 10,1 (5g)' },
      { name: 'Janka', lastName: 'Vogue', phone: '', tags: ['Farbenie', 'Tónovanie'], notes: 'K: 6 + 0,22 | D: 9,2 + 7 | Konce: 10,21 + 7,21' },
      { name: 'Zubárka', lastName: 'Kremeňová', phone: '', tags: ['Farbenie'], notes: 'K: 3 + 4 | D: 7,32 + 6,1' },
      { name: 'Ingrid', lastName: 'Jutková', phone: '', tags: ['Farbenie'], notes: 'K: 4 + 5 | D: 5' },
      { name: 'Laura', lastName: 'Reklamka', phone: '', tags: ['Farbenie'], notes: 'K: 5 | D: 7,1' },
      { name: 'Zakarová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5,14 | D: 6,14 | NOVÁ: K: 5 + 6,1, D: 6 (30g) + 6,1 (10g)' },
      { name: 'Ungvarská', lastName: '', phone: '', tags: ['Šediny', 'Blond'], notes: '60% šediny | K: 9 + 9,21 (9%)' },
      { name: 'Zubárka', lastName: 'Dcéra', phone: '', tags: ['Farbenie'], notes: 'Celá hlava: 4 + 5,1' },
      { name: 'Kováčová', lastName: '', phone: '0918363903', tags: ['Šediny'], notes: 'Recept: 9,2 + 9 (šedivé), Predpigmentácia 10 !Korienky Jul 2024: K: 6.00!' },
      { name: 'Zuzuličová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5,32 + 6 | D: 8,32 + 8,2' },
      { name: 'Michaela', lastName: 'Brost', phone: '', tags: ['Farbenie'], notes: 'Celá hlava: 6,3 + 6,35 (Nová Farba)' },
      { name: 'Veronica', lastName: 'Gonošová', phone: '', tags: ['Farbenie'], notes: 'K: 6,14 + 6,32' },
      { name: 'Ukrajinka', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 6,2 + 6 | D: 6,14' },
      { name: 'Hladíková', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5 | D: 7,13 + 6,00' },
      { name: 'Miklošová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 6 + 7,14' },
      { name: 'Čorňáková', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 5 + 7,1 | D: 9,13 + 9,1 + 5g + 0,11' },
      { name: 'Claudia', lastName: 'Orosová', phone: '', tags: ['Tmavá'], notes: 'Recept: 4 + 4,32 + kvapka 5 (3%)' },
      { name: 'Martina', lastName: 'Kyovská', phone: '', tags: ['Farbenie'], notes: 'K: 6,32' },
      { name: 'Eniko', lastName: '', phone: '', tags: ['Farbenie'], notes: 'Recept: 7,00 + 6,1' },
      { name: 'Lenka', lastName: 'Pustajová', phone: '', tags: ['Farbenie'], notes: 'K: 3 (stiahnuť do polovice) | D: 6' },
      { name: 'Peťa', lastName: 'Vodičák', phone: '', tags: ['Blond'], notes: 'K: 8 + 8,2 | D: 9,2' },
      { name: 'Katka', lastName: 'Buratti', phone: '', tags: ['Farbenie'], notes: 'K: 6,14 + 6 | D: 7,14' },
      { name: 'Janka', lastName: 'ANJ', phone: '', tags: ['Blond'], notes: 'K: 9,2 + 9,00 (1:1, 9%)' },
      { name: 'Blažka', lastName: 'Cibulová', phone: '', tags: ['Farbenie'], notes: 'K: 3 | D: 5 + 5,1' },
      { name: 'Dudová', lastName: 'Mama', phone: '', tags: ['Farbenie'], notes: 'K: 6,1 + 7,1 + 6 | D: 8 + š + 8,2' },
      { name: 'Valentová', lastName: '', phone: '0908097361', tags: ['Farbenie'], notes: 'K: 6.00 | D: 7,1' },
      { name: 'Filičková', lastName: '', phone: '', tags: ['Farbenie', 'Medená'], notes: 'K: 7,31 + 6 (Permanentne) | D: 8,31 + 0,44 kvapka | NOVÁ: 7.31 (20g) + 6 (10g) + 0.44 kvapka (odrasty leto)' },
      { name: 'Šokyrová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'Recept: 6,35' },
      { name: 'Bianka', lastName: 'Rujaková', phone: '', tags: ['Medená'], notes: 'K-D: 7,4' },
      { name: 'Lucia', lastName: 'Jurková', phone: '', tags: ['Farbenie'], notes: 'K: 5,00 | D: 7,13' },
      { name: 'Pechová', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 7,21 + 6 | D: 8,2 + 7' },
      { name: 'Marhefková', lastName: '', phone: '', tags: ['Tmavá'], notes: 'K: 4 + 4,32 | D: 4 + 4,32' },
      { name: 'Janka', lastName: 'Šmaterová', phone: '', tags: ['Farbenie'], notes: 'Recept: 6 + 7,2 + 7,14' },
      { name: 'Zuzana', lastName: 'Landan', phone: '', tags: ['Farbenie'], notes: 'K: 6,1 | D: 7-6' },
      { name: 'Galina', lastName: '', phone: '', tags: ['Farbenie'], notes: 'K: 6 + 7,3 | D: 9,31 + 8' },
      { name: 'Miriam', lastName: 'Šolcová', phone: '', tags: ['Farbenie'], notes: 'K: 7,21 (viac) + 7' },
      { name: 'Naty', lastName: 'Mydlo', phone: '', tags: ['Farbenie'], notes: 'Recept: 7,21 | K: 6,00 + 7,21' },
      { name: 'Bezáková', lastName: '', phone: '', tags: ['Blond', 'Zosvetľovanie'], notes: 'K: 11,00 + 11,02 | D: teplé + 12%' },
      { name: 'Jarka', lastName: 'Magnesová', phone: '', tags: ['Farbenie'], notes: 'K: 5,32 | D: 6,35' },
      { name: 'Radka', lastName: 'Siváková', phone: '', tags: ['Farbenie'], notes: 'Recept: 7,21' },
      { name: 'Teta', lastName: 'Borša', phone: '', tags: ['Farbenie'], notes: 'K: 5 + 4,22 | Okolo tváre: 6,22 | Stred: 7,2' },
      { name: 'Sali', lastName: '', phone: '', tags: ['Farbenie'], notes: '7g - 4, 3 - 5,1 (3%)' },
      { name: 'Janka', lastName: 'Špkirová', phone: '', tags: ['Farbenie'], notes: 'K: 5,00 | D: 9,21' },
      { name: 'Nikola', lastName: 'Grančová', phone: '', tags: ['Tmavá'], notes: 'Celá hlava: 3 + 4 + 6,11 (trošku)' },
      { name: 'Lýdia', lastName: 'Sajková', phone: '', tags: ['Farbenie'], notes: 'K: 6,00 | D: 7,14' },
      { name: 'Jana', lastName: 'Sučková', phone: '', tags: ['Farbenie'], notes: 'K: 3 + 4 (pôl na pôl) | D: 5,32 (10g) + 6,32 (30g)' },
      { name: 'Simona', lastName: 'Broóková', phone: '', tags: ['Farbenie'], notes: 'Celá hlava: 5,1' },
      { name: 'Viky', lastName: 'Medvedová', phone: '', tags: ['Farbenie'], notes: 'Celá hlava: 8,13' },
      { name: 'Pravdová', lastName: '', phone: '', tags: ['Medená'], notes: 'K: 7,4 + kvapka 6,34 | D: 7.34' },
      { name: 'Adriana', lastName: 'Tomči', phone: '', tags: ['Blond'], notes: 'Recept: 10,31' },
      { name: 'Nikola', lastName: 'Heribanová', phone: '', tags: ['Medená'], notes: 'K: 8 - 8,4 | D: 8,4' },
      { name: 'Miška', lastName: 'Petroci', phone: '', tags: ['Farbenie'], notes: 'Recept: 6,1 - 7,31 - Green - 6' },
      { name: 'Gashi Danalo', lastName: 'Mama', phone: '', tags: ['Farbenie'], notes: 'K: 8.31' },
      { name: 'Dominika', lastName: 'Žigová', phone: '', tags: ['Farbenie'], notes: 'K: 6 - 7 - 7,14 (10:10:10) | D: 7.14' },
      { name: 'Nikola', lastName: 'Galošová', phone: '', tags: ['Farbenie'], notes: 'Celá hlava: 5 - 5,1' },
      { name: 'Lenka', lastName: 'Eštuová', phone: '', tags: ['Farbenie'], notes: 'K: 7.4 - 7 - trošku 6 | D: 7 - 7.31' },
      { name: 'Mia', lastName: 'Lašeníková', phone: '', tags: ['Farbenie'], notes: 'K: 6.3 | D: 8.32' },
      { name: 'Michaela', lastName: 'Ručkárová', phone: '', tags: ['Farbenie'], notes: 'K: 6,1 | D: 7.21' },
      { name: 'Svetluška', lastName: '', phone: '', tags: ['Tmavá'], notes: 'K: 3' },
      { name: 'Martinka', lastName: 'Susede', phone: '', tags: ['Farbenie'], notes: 'K: 6 | Vyčistiť dĺžky' },
      { name: 'VENOM', lastName: '', phone: '', tags: ['Blond'], notes: 'Recept: 9,1 + 9,21' },
      { name: 'Izabela', lastName: 'Beriová', phone: '', tags: ['Melír', 'Farbenie'], notes: 'Recept: 5.1 + 00 + 6.1 (melír stmavovanie)' },
      { name: 'Laura', lastName: 'Galérka', phone: '', tags: ['Farbenie'], notes: 'K: 6,00 | D: 6,1' },
      { name: 'Kostelníková', lastName: '', phone: '0915442655', tags: [], notes: '' }
    ];

    for (const c of initialCustomers) {
      await this.addCustomer(c);
    }
  }
}
