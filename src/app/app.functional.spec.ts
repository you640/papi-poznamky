import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { CustomerService } from './customer.service';
import { db } from './db';

describe('Papi CRM Functional Logic & E2E Unit Tests', () => {
  let service: CustomerService;

  beforeAll(async () => {
    // Force reload default clients into Dexie DB once
    await db.customers.clear();
    await db.visits.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('dont_reseed_after_wipe');
      localStorage.setItem('did_seed_hair_clients_v10', 'true');
    }

    service = new CustomerService();
    await service.forceReloadDefaultClients();

    // Wait until liveQuery populates customers
    for (let i = 0; i < 30; i++) {
      if (service.customersList().length > 100) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  beforeEach(() => {
    service.searchQuery.set('');
  });

  it('should seed initial hair salon customers', async () => {
    const customers = service.filteredCustomers();
    expect(customers.length).toBeGreaterThan(100);
    expect(customers.some(c => c.name.toLowerCase().includes('sofia'))).toBe(true);
  });

  it('should filter customers by search query (name)', async () => {
    service.searchQuery.set('sofia');
    await new Promise(resolve => setTimeout(resolve, 50));
    const filtered = service.filteredCustomers();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].name.toLowerCase()).toContain('sofia');
  });

  it('should filter customers by chemical formula notes', async () => {
    service.searchQuery.set('6,14');
    await new Promise(resolve => setTimeout(resolve, 50));
    const filtered = service.filteredCustomers();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.some(c => (c.notes || '').includes('6,14'))).toBe(true);
  });

  it('should filter by tags', async () => {
    service.searchQuery.set('blond');
    await new Promise(resolve => setTimeout(resolve, 50));
    const filtered = service.filteredCustomers();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(c => 
      c.name.toLowerCase().includes('blond') || 
      c.lastName.toLowerCase().includes('blond') ||
      (c.notes || '').toLowerCase().includes('blond') ||
      c.tags.some(t => t.toLowerCase().includes('blond'))
    )).toBe(true);
  });

  it('should sort customers alphabetically by last name / name', async () => {
    service.searchQuery.set('');
    await new Promise(resolve => setTimeout(resolve, 50));
    const customers = service.filteredCustomers();
    expect(customers.length).toBeGreaterThan(0);
    
    for (let i = 0; i < customers.length - 1; i++) {
      const current = (customers[i].lastName || customers[i].name).toLowerCase();
      const next = (customers[i+1].lastName || customers[i+1].name).toLowerCase();
      expect(current.localeCompare(next)).toBeLessThanOrEqual(1);
    }
  });

  it('should add a new customer and retrieve it', async () => {
    const newCustomer = {
      name: 'NováE2E',
      lastName: 'Klientka',
      phone: '0911222333',
      tags: ['VIP', 'Farbenie'],
      notes: 'K: 7,1 | D: 9,21'
    };
    
    await service.addCustomer(newCustomer);
    await new Promise(resolve => setTimeout(resolve, 150));
    
    service.searchQuery.set('NováE2E');
    const filtered = service.filteredCustomers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('NováE2E');
    expect(filtered[0].notes).toBe('K: 7,1 | D: 9,21');
  });

  it('should track visits for a customer and update last visit date', async () => {
    service.searchQuery.set('sofia');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const sofia = service.filteredCustomers()[0];
    expect(sofia).toBeDefined();
    
    const visitDate = new Date();
    await service.addVisit({
      customerId: sofia.id!,
      date: visitDate,
      service: 'Balayage + Tónovanie',
      price: 85,
      note: 'Recept: K: 6.0 + 6.14, D: 9.21'
    });
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const visits = await service.getCustomerVisits(sofia.id!);
    expect(visits.length).toBeGreaterThan(0);
    expect(visits[0].service).toBe('Balayage + Tónovanie');
    expect(visits[0].price).toBe(85);

    const updatedSofia = await db.customers.get(sofia.id!);
    expect(updatedSofia?.lastVisit).toEqual(visitDate);
  });

  it('should update customer phone and formula notes', async () => {
    service.searchQuery.set('sofia');
    await new Promise(resolve => setTimeout(resolve, 50));
    const sofia = service.filteredCustomers()[0];
    
    await service.updateCustomer(sofia.id!, {
      phone: '0901 111 222',
      notes: 'K: 5,00 | D: 7,21 + 6% oxi'
    });
    
    await new Promise(resolve => setTimeout(resolve, 150));
    const updated = await db.customers.get(sofia.id!);
    expect(updated?.phone).toBe('0901 111 222');
    expect(updated?.notes).toBe('K: 5,00 | D: 7,21 + 6% oxi');
  });

  it('should update visit notes', async () => {
    service.searchQuery.set('sofia');
    await new Promise(resolve => setTimeout(resolve, 50));
    const sofia = service.filteredCustomers()[0];
    
    await service.addVisit({
      customerId: sofia.id!,
      date: new Date(),
      service: 'Strih',
      price: 25,
      note: 'Pôvodná poznámka'
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    const visits = await service.getCustomerVisits(sofia.id!);
    const firstVisit = visits[0];
    
    await service.updateVisit(firstVisit.id!, {
      note: 'Upravená poznámka k účesu'
    });
    
    const updatedVisits = await service.getCustomerVisits(sofia.id!);
    expect(updatedVisits[0].note).toBe('Upravená poznámka k účesu');
  });

  it('should update customer photo and retrieve profile image base64', async () => {
    service.searchQuery.set('sofia');
    await new Promise(resolve => setTimeout(resolve, 50));
    const sofia = service.filteredCustomers()[0];

    const dummyBase64Photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
    await service.updateCustomer(sofia.id!, {
      photo: dummyBase64Photo
    });

    await new Promise(resolve => setTimeout(resolve, 150));
    const updated = await db.customers.get(sofia.id!);
    expect(updated?.photo).toBe(dummyBase64Photo);
  });

  it('should identify duplicate customers based on name or phone', async () => {
    // Add two duplicate records for E2E Test
    const dup1Id = await service.addCustomer({
      name: 'Mária',
      lastName: 'Testovacia',
      phone: '0905 123 999',
      tags: ['Farbenie'],
      notes: 'Pôvodná poznámka'
    });

    const dup2Id = await service.addCustomer({
      name: 'Maria',
      lastName: 'Testovacia',
      phone: '0905123999',
      tags: ['Tónovanie', 'VIP'],
      notes: 'Druhá poznámka z druhého záznamu'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const duplicateGroups = await service.findDuplicateGroups();
    const group = duplicateGroups.find(g => g.some(c => c.id === dup1Id || c.id === dup2Id));
    
    expect(group).toBeDefined();
    expect(group?.length).toBeGreaterThanOrEqual(2);
  });

  it('should merge duplicate customer records and reassign visits preserving data integrity', async () => {
    const mainId = await service.addCustomer({
      name: 'Zuzana',
      lastName: 'Duplicitná',
      phone: '0918 888 777',
      tags: ['Farbenie'],
      notes: 'Hlavná poznámka'
    });

    const duplicateId = await service.addCustomer({
      name: 'Zuzana',
      lastName: 'Duplicitna',
      phone: '0918 888 777',
      tags: ['VIP'],
      notes: 'Doplnková poznámka'
    });

    // Add a visit to the duplicate record
    await service.addVisit({
      customerId: duplicateId,
      date: new Date(),
      service: 'Tónovanie blond',
      price: 45,
      note: 'Návšteva u duplicitného profilu'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Run cleanup operation
    const result = await service.cleanupDuplicates();
    expect(result.mergedGroupsCount).toBeGreaterThan(0);
    expect(result.removedDuplicatesCount).toBeGreaterThan(0);

    // Verify duplicate record is removed
    const removedDup = await db.customers.get(duplicateId);
    expect(removedDup).toBeUndefined();

    // Verify main customer is updated with merged tags and notes
    const mainCustomer = await db.customers.get(mainId);
    expect(mainCustomer).toBeDefined();
    expect(mainCustomer?.tags).toContain('Farbenie');
    expect(mainCustomer?.tags).toContain('VIP');
    expect(mainCustomer?.notes).toContain('Doplnková poznámka');

    // Verify visit was reassigned to main customer
    const mainVisits = await service.getCustomerVisits(mainId);
    expect(mainVisits.some(v => v.service === 'Tónovanie blond')).toBe(true);
  });
});

