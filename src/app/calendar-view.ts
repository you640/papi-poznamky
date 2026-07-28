import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CustomerService } from './customer.service';
import type { Customer, Visit } from './db';

type VisitWithCustomer = Visit & { customer: Customer };

@Component({
  standalone: true,
  selector: 'app-calendar-view',
  imports: [CommonModule, MatIconModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './calendar-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarViewComponent {
  cs = inject(CustomerService);
  
  allVisits = signal<VisitWithCustomer[]>([]);
  isRefreshing = signal<boolean>(false);
  
  // Filters
  filterCustomer = signal<number | null>(null);

  // All customers sorted alphabetically for the select dropdown
  allCustomersSorted = computed(() => {
    const list = [...this.cs.customersList()];
    return list.sort((a, b) => {
      const lastA = a.lastName || a.name || '';
      const lastB = b.lastName || b.name || '';
      return lastA.localeCompare(lastB);
    });
  });

  filteredVisits = computed(() => {
    let visits = this.allVisits();
    
    // 1. Filter by selected customer dropdown
    if (this.filterCustomer() !== null) {
      visits = visits.filter(v => v.customerId === this.filterCustomer());
    }
    
    // 2. Filter by search query (text input)
    const query = this.cs.searchQuery()?.trim().toLowerCase();
    if (query) {
      visits = visits.filter(v => {
        const firstName = (v.customer?.name || '').toLowerCase();
        const lastName = (v.customer?.lastName || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        const phone = (v.customer?.phone || '').toLowerCase();
        const service = (v.service || '').toLowerCase();
        const note = (v.note || '').toLowerCase();
        const custNotes = (v.customer?.notes || '').toLowerCase();
        const tags = (v.customer?.tags || []).join(' ').toLowerCase();
        const priceStr = String(v.price || '');
        const dateStr = v.date ? new Date(v.date).toLocaleDateString('sk-SK') : '';

        return fullName.includes(query) ||
               phone.includes(query) ||
               service.includes(query) ||
               note.includes(query) ||
               custNotes.includes(query) ||
               tags.includes(query) ||
               priceStr.includes(query) ||
               dateStr.includes(query);
      });
    }

    return visits;
  });

  constructor() {
    this.refreshVisits();
  }

  async refreshVisits() {
    this.isRefreshing.set(true);
    try {
      const visits = await this.cs.getAllVisitsWithCustomers();
      this.allVisits.set(visits);
    } finally {
      setTimeout(() => this.isRefreshing.set(false), 400);
    }
  }

  getInitials(c: Customer) {
    if (!c) return '??';
    const first = c?.name?.trim()?.[0] || '';
    const last = c?.lastName?.trim()?.[0] || '';
    if (first && last) {
      return `${first}${last}`.toUpperCase();
    }
    if (first) {
      return c.name.trim().slice(0, 2).toUpperCase();
    }
    return '??';
  }

  onCustomerFilterChange(val: string | number) {
    if (!val || val === '' || val === 'null') {
      this.filterCustomer.set(null);
    } else {
      this.filterCustomer.set(Number(val));
    }
  }

  clearFilters() {
    this.filterCustomer.set(null);
    this.cs.searchQuery.set('');
  }
}

