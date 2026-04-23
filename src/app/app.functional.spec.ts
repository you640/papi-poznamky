import { describe, it, expect, beforeEach } from 'vitest';
import { CustomerService } from './customer.service';
import { db } from './db';

// Mock the MatIcon and other UI components if we were doing DOM tests
// But we'll focus on the data and state flow which is the "brain" of the app.

describe('Papi CRM Functional Logic', () => {
  let service: CustomerService;

  beforeEach(async () => {
    // Clear DB fully
    await db.customers.clear();
    await db.visits.clear();
    
    // Reset searchQuery to avoid leftover filters
    service = new CustomerService();
    service.searchQuery.set('');
    
    // Wait longer for the service to initialize and seed data reliably
    await new Promise(resolve => setTimeout(resolve, 300)); 
  });

  it('should seed initial customers', async () => {
    const customers = service.filteredCustomers();
    expect(customers.length).toBe(6); // 6 seeded customers
    expect(customers.some(c => c.lastName === 'Mrkva')).toBe(true);
  });

  it('should filter customers by search query', async () => {
    service.searchQuery.set('Jozef');
    await new Promise(resolve => setTimeout(resolve, 50));
    const filtered = service.filteredCustomers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('Jozef');
  });

  it('should filter by tags', async () => {
    service.searchQuery.set('VIP');
    await new Promise(resolve => setTimeout(resolve, 100));
    const filtered = service.filteredCustomers();
    // Use clear check
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(c => 
      c.name.toLowerCase().includes('vip') || 
      c.lastName.toLowerCase().includes('vip') ||
      c.tags.some(t => t.toLowerCase().includes('vip'))
    )).toBe(true);
  });

  it('should sort customers alphabetically by last name', async () => {
    service.searchQuery.set('');
    const customers = service.filteredCustomers();
    const lastNames = customers.map(c => c.lastName);
    const sortedLastNames = [...lastNames].sort((a, b) => a.localeCompare(b));
    expect(lastNames).toEqual(sortedLastNames);
  });

  it('should add a new customer and retrieve it', async () => {
    const newCustomer = {
      name: 'Test',
      lastName: 'User',
      phone: '123456789',
      tags: ['New']
    };
    
    await service.addCustomer(newCustomer);
    
    // Dexie is live, so it should update the signal via liveQuery
    await new Promise(resolve => setTimeout(resolve, 100));
    
    service.searchQuery.set('User');
    const filtered = service.filteredCustomers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('Test');
  });

  it('should track visits for a customer', async () => {
    service.searchQuery.set('Mrkva');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const jozef = service.filteredCustomers()[0];
    expect(jozef).toBeDefined();
    
    const visits = await service.getCustomerVisits(jozef.id!);
    expect(visits.length).toBe(1);
    expect(visits[0].service).toBe('Pravidelný');
  });

  it('should update last visit date when adding a visit', async () => {
    service.searchQuery.set('Slanina');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const peter = service.filteredCustomers()[0];
    expect(peter).toBeDefined();
    
    const newDate = new Date();
    
    await service.addVisit({
      customerId: peter.id!,
      date: newDate,
      service: 'Extra Fade',
      price: 30,
      note: 'New visit'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const updatedPeter = await db.customers.get(peter.id!);
    expect(updatedPeter?.lastVisit).toEqual(newDate);
  });

  it('should update customer phone and notes', async () => {
    service.searchQuery.set('Mrkva');
    await new Promise(resolve => setTimeout(resolve, 50));
    const jozef = service.filteredCustomers()[0];
    
    await service.updateCustomer(jozef.id!, {
      phone: '0000 000 000',
      notes: 'Test info'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    const updated = await db.customers.get(jozef.id!);
    expect(updated?.phone).toBe('0000 000 000');
    expect(updated?.notes).toBe('Test info');
  });

  it('should update visit notes', async () => {
    service.searchQuery.set('Mrkva');
    await new Promise(resolve => setTimeout(resolve, 50));
    const jozef = service.filteredCustomers()[0];
    
    const visits = await service.getCustomerVisits(jozef.id!);
    const firstVisit = visits[0];
    
    await service.updateVisit(firstVisit.id!, {
      note: 'Updated visit note'
    });
    
    const updatedVisits = await service.getCustomerVisits(jozef.id!);
    expect(updatedVisits[0].note).toBe('Updated visit note');
  });
});
