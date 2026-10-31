/**
 * NOTEBUILDER - Landing Page Script
 */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Header scroll effect
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  // 2. Mobile menu toggle
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const mainNav = document.querySelector('.main-nav');
  if (mobileBtn && mainNav) {
    mobileBtn.addEventListener('click', () => {
      if (mainNav.style.display === 'block') {
        mainNav.style.display = 'none';
      } else {
        mainNav.style.display = 'block';
        mainNav.style.position = 'absolute';
        mainNav.style.top = '100%';
        mainNav.style.left = '0';
        mainNav.style.width = '100%';
        mainNav.style.background = '#22242a';
        mainNav.style.padding = '20px';
      }
    });
  }

  // 3. Smooth scroll for indicator
  const scrollIndicator = document.querySelector('.hero-scroll-indicator');
  if (scrollIndicator) {
    scrollIndicator.addEventListener('click', () => {
      const aboutSection = document.querySelector('#about');
      if (aboutSection) {
        aboutSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // 4. Quick stats loader from localStorage
  const savedNotes = JSON.parse(localStorage.getItem('notebuilder_notes') || '[]');
  const statNotesCount = document.getElementById('stat-total-notes');
  if (statNotesCount) {
    statNotesCount.textContent = savedNotes.length > 0 ? savedNotes.length : '12+';
  }
});
