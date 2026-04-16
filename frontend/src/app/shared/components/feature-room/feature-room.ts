import { Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'app-feature-room',
  imports: [],
  templateUrl: './feature-room.html',
  styleUrl: './feature-room.scss',
})
export class FeatureRoom {
   @ViewChild('featureSection') featureSection!: ElementRef;

  ngAfterViewInit(): void {

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {

          if (entry.isIntersecting) {

            const elements = this.featureSection.nativeElement.querySelectorAll('.animate-on-scroll');

            elements.forEach((el: HTMLElement) => {
              el.classList.add('show');
            });

            observer.disconnect(); // animate only once
          }

        });
      },
      {
        threshold: 0.2
      }
    );

    observer.observe(this.featureSection.nativeElement);

  }

}
