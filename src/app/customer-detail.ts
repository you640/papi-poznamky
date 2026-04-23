import { ChangeDetectionStrategy, Component, input, output, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import type { Customer, Visit } from './db';

@Component({
  standalone: true,
  selector: 'app-customer-detail',
  imports: [CommonModule, MatIconModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './customer-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailComponent {
  customer = input.required<Customer>();
  visits = input<Visit[]>([]);
  
  closed = output<void>();
  edit = output<Customer>();
  book = output<Customer>();
  save = output<{ id: number, phone: string, notes: string }>();
  updateVisitNote = output<{ id: number, note: string }>();

  isEditing = signal(false);
  editPhone = signal('');
  editNotes = signal('');

  editingVisitId = signal<number | null>(null);
  currentEditVisitNote = signal('');

  constructor() {
    effect(() => {
      const c = this.customer();
      this.editPhone.set(c.phone || '');
      this.editNotes.set(c.notes || '');
    });
  }

  toggleEdit() {
    this.isEditing.update(v => !v);
  }

  saveChanges() {
    const c = this.customer();
    if (c.id) {
      this.save.emit({
        id: c.id,
        phone: this.editPhone(),
        notes: this.editNotes()
      });
      this.isEditing.set(false);
    }
  }

  startEditVisit(visit: Visit) {
    if (visit.id) {
      this.editingVisitId.set(visit.id);
      this.currentEditVisitNote.set(visit.note || '');
    }
  }

  cancelEditVisit() {
    this.editingVisitId.set(null);
    this.currentEditVisitNote.set('');
  }

  saveVisit(visit: Visit) {
    if (visit.id) {
      this.updateVisitNote.emit({
        id: visit.id,
        note: this.currentEditVisitNote()
      });
      this.editingVisitId.set(null);
      this.currentEditVisitNote.set('');
    }
  }

  getInitials(c: Customer) {
    const first = c.name?.[0] || '?';
    const last = c.lastName?.[0] || '?';
    return `${first}${last}`.toUpperCase();
  }
}
