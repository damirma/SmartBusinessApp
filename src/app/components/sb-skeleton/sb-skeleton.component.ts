import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonVariant = 'card' | 'row' | 'block';

@Component({
  selector: 'app-sb-skeleton',
  templateUrl: './sb-skeleton.component.html',
  styleUrls: ['./sb-skeleton.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class SbSkeletonComponent {
  @Input() variant: SkeletonVariant = 'card';
  @Input() count: number = 1;
  @Input() height: string = '';   // Used for 'block' variant
  @Input() animated: boolean = true;

  get items(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }
}
