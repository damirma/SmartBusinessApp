import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  layersOutline, cloudUploadOutline, documentTextOutline, barChartOutline,
  serverOutline, chevronForwardOutline, checkmarkCircle, timeOutline,
  peopleOutline, codeSlashOutline, gitBranchOutline,
} from 'ionicons/icons';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonIcon],
})
export class HomePage {
  readonly workerUrl = environment.workerUrl.replace(/^https?:\/\//, '');

  constructor() {
    addIcons({
      layersOutline, cloudUploadOutline, documentTextOutline, barChartOutline,
      serverOutline, chevronForwardOutline, checkmarkCircle, timeOutline,
      peopleOutline, codeSlashOutline, gitBranchOutline,
    });
  }
}