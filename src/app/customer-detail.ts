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
  save = output<{ id: number, name: string, lastName: string, phone: string, email: string, tags: string[], notes: string }>();
  deleteCustomer = output<number>();
  updateVisitNote = output<{ id: number, note: string }>();

  isEditing = signal(false);
  editName = signal('');
  editLastName = signal('');
  editPhone = signal('');
  editEmail = signal('');
  editTags = signal('');
  editNotes = signal('');

  editingVisitId = signal<number | null>(null);
  currentEditVisitNote = signal('');

  isDeleteConfirmOpen = signal(false);

  constructor() {
    effect(() => {
      const c = this.customer();
      this.editName.set(c.name || '');
      this.editLastName.set(c.lastName || '');
      this.editPhone.set(c.phone || '');
      this.editEmail.set(c.email || '');
      this.editTags.set((c.tags || []).join(', '));
      this.editNotes.set(c.notes || '');
      this.isEditing.set(false);
      this.isDeleteConfirmOpen.set(false);
    });
  }

  toggleEdit() {
    this.isEditing.update(v => !v);
  }

  cancelEdit() {
    const c = this.customer();
    this.editName.set(c.name || '');
    this.editLastName.set(c.lastName || '');
    this.editPhone.set(c.phone || '');
    this.editEmail.set(c.email || '');
    this.editTags.set((c.tags || []).join(', '));
    this.editNotes.set(c.notes || '');
    this.isEditing.set(false);
  }

  saveChanges() {
    const c = this.customer();
    if (c.id) {
      const tagsArray = this.editTags()
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      this.save.emit({
        id: c.id,
        name: this.editName().trim(),
        lastName: this.editLastName().trim(),
        phone: this.editPhone().trim(),
        email: this.editEmail().trim(),
        tags: tagsArray,
        notes: this.editNotes()
      });
      this.isEditing.set(false);
    }
  }

  confirmDelete() {
    const c = this.customer();
    if (c.id) {
      this.deleteCustomer.emit(c.id);
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

  get parsedFormulaParts() {
    const notes = this.customer()?.notes;
    if (!notes) return [];

    const rawParts = notes.split(/[|\n;]/).map(p => p.trim()).filter(p => p.length > 0);
    return rawParts.map(part => {
      let type: 'roots' | 'lengths' | 'middle' | 'new' | 'general' = 'general';
      let title = 'Receptúra / Poznámka';
      let content = part;

      const lower = part.toLowerCase();
      if (lower.startsWith('k:') || lower.startsWith('korienky')) {
        type = 'roots';
        title = 'Korienky (Roots)';
        content = part.replace(/^(k:|korienky:?)/i, '').trim();
      } else if (lower.startsWith('d:') || lower.startsWith('dĺžky') || lower.startsWith('dlzky')) {
        type = 'lengths';
        title = 'Dĺžky / Končeky';
        content = part.replace(/^(d:|dĺžky:?|dlzky:?)/i, '').trim();
      } else if (lower.startsWith('s:') || lower.startsWith('stred')) {
        type = 'middle';
        title = 'Stred';
        content = part.replace(/^(s:|stred:?)/i, '').trim();
      } else if (lower.startsWith('nová:') || lower.startsWith('nova:')) {
        type = 'new';
        title = 'Nová receptúra';
        content = part.replace(/^(nová:|nova:?)/i, '').trim();
      } else if (lower.startsWith('ton:') || lower.startsWith('toner:') || lower.startsWith('tonovačka:')) {
        type = 'middle';
        title = 'Tónovanie / Toner';
        content = part.replace(/^(ton:|toner:|tonovačka:)/i, '').trim();
      } else if (lower.startsWith('celé vlasy:') || lower.startsWith('celá hlava:')) {
        type = 'roots';
        title = 'Celé vlasy / Hlava';
        content = part.replace(/^(celé vlasy:|celá hlava:)/i, '').trim();
      }

      return { type, title, content, original: part };
    });
  }

  getInitials(c: Customer) {
    if (!c) return '??';
    const first = c.name?.trim()?.[0] || '';
    const last = c.lastName?.trim()?.[0] || '';
    if (first && last) {
      return `${first}${last}`.toUpperCase();
    }
    if (first) {
      return c.name.trim().slice(0, 2).toUpperCase();
    }
    return '??';
  }
}
