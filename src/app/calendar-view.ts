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
  
  // Filters
  filterCustomer = signal<number | null>(null);

  filteredVisits = computed(() => {
    let visits = this.allVisits();
    
    if (this.filterCustomer() !== null) {
      visits = visits.filter(v => v.customerId === this.filterCustomer());
    }
    
    return visits;
  });

  constructor() {
    this.refreshVisits();
  }

  async refreshVisits() {
    const visits = await this.cs.getAllVisitsWithCustomers();
    this.allVisits.set(visits);
  }

  getInitials(c: Customer) {
    const first = c?.name?.[0] || '?';
    const last = c?.lastName?.[0] || '?';
    return `${first}${last}`.toUpperCase();
  }

  onCustomerFilterChange(val: string | number) {
    if (!val || val === '') {
      this.filterCustomer.set(null);
    } else {
      this.filterCustomer.set(Number(val));
    }
  }
}
