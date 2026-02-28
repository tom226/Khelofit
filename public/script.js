/* ============================================
   KHELOFIT — Landing Page Scripts
   Waitlist form, FAQ, mobile menu, referrals
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    // === CONFIG ===
    const API_BASE = window.location.origin;

    // === ELEMENTS ===
    const navbar = document.querySelector('.navbar');
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenu = document.querySelector('.mobile-menu');
    const heroForm = document.getElementById('heroForm');
    const mainForm = document.getElementById('mainForm');
    const modal = document.getElementById('successModal');
    const faqItems = document.querySelectorAll('.faq-item');
    const waitlistCountEls = document.querySelectorAll('.waitlist-count');

    // === NAVBAR SCROLL ===
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    });

    // === MOBILE MENU ===
    mobileBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        const spans = mobileBtn.querySelectorAll('span');
        if (mobileMenu.classList.contains('active')) {
            spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
            spans[1].style.opacity = '0';
            spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
        } else {
            spans[0].style.transform = '';
            spans[1].style.opacity = '';
            spans[2].style.transform = '';
        }
    });

    // Close menu when link clicked
    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            const spans = mobileBtn.querySelectorAll('span');
            spans[0].style.transform = '';
            spans[1].style.opacity = '';
            spans[2].style.transform = '';
        });
    });

    // === SMOOTH SCROLL ===
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (!href || href === '#' || !href.startsWith('#')) return;

            const targetId = href.slice(1);
            const target = document.getElementById(targetId);
            if (!target) return;

            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // === REFERRAL CODE FROM URL ===
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        const refInput = document.getElementById('referralCode');
        if (refInput) refInput.value = refCode;
        localStorage.setItem('kf_referral', refCode);
    }

    // === LOAD WAITLIST COUNT ===
    async function loadWaitlistCount() {
        try {
            const res = await fetch(`${API_BASE}/api/waitlist/count`);
            const data = await res.json();
            const count = data.count || 0;
            waitlistCountEls.forEach(el => {
                animateNumber(el, count);
            });
        } catch {
            // Default
            waitlistCountEls.forEach(el => el.textContent = '2,847');
        }
    }

    function animateNumber(el, target) {
        const start = 0;
        const duration = 1500;
        const startTime = Date.now();
        
        function tick() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = Math.round(start + (target - start) * ease);
            el.textContent = current.toLocaleString('en-IN');
            if (progress < 1) requestAnimationFrame(tick);
        }
        tick();
    }

    loadWaitlistCount();

    // === HERO FORM (Quick signup with phone) ===
    heroForm.addEventListener('submit', async e => {
        e.preventDefault();
        const phone = heroForm.querySelector('input[name="phone"]').value.trim();
        
        if (!validatePhone(phone)) {
            shakeEl(heroForm.querySelector('input[name="phone"]'));
            return;
        }

        const btn = heroForm.querySelector('button');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Joining...';

        try {
            const res = await fetch(`${API_BASE}/api/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: `+91${phone}`,
                    source: 'hero_form',
                    referredBy: localStorage.getItem('kf_referral') || ''
                })
            });

            const data = await res.json();

            if (data.success) {
                showSuccessModal(data.referralCode, data.position);
                heroForm.reset();
            } else {
                showToast(data.message || 'Something went wrong. Try again!', 'error');
            }
        } catch {
            showToast('Server is starting up. Please try again in a moment!', 'error');
        }

        btn.disabled = false;
        btn.innerHTML = 'Join Waitlist →';
    });

    // === MAIN WAITLIST FORM ===
    mainForm.addEventListener('submit', async e => {
        e.preventDefault();
        const formData = new FormData(mainForm);
        const phone = formData.get('phone').trim();
        const name = formData.get('name').trim();
        const email = formData.get('email').trim();
        const city = formData.get('city');

        // Validations
        if (!name) { shakeEl(mainForm.querySelector('input[name="name"]')); return; }
        if (!validatePhone(phone)) { shakeEl(mainForm.querySelector('input[name="phone"]')); return; }
        if (email && !validateEmail(email)) { shakeEl(mainForm.querySelector('input[name="email"]')); return; }

        // Get interests
        const interests = [];
        mainForm.querySelectorAll('input[name="interests"]:checked').forEach(cb => {
            interests.push(cb.value);
        });

        const btn = mainForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Joining KheloFit...';

        try {
            const res = await fetch(`${API_BASE}/api/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    phone: `+91${phone}`,
                    email: email || undefined,
                    city: city || undefined,
                    interests,
                    referredBy: formData.get('referral') || localStorage.getItem('kf_referral') || '',
                    source: 'main_form'
                })
            });

            const data = await res.json();

            if (data.success) {
                showSuccessModal(data.referralCode, data.position);
                mainForm.reset();
            } else {
                showToast(data.message || 'Something went wrong. Try again!', 'error');
            }
        } catch {
            showToast('Server is starting up. Please try again in a moment!', 'error');
        }

        btn.disabled = false;
        btn.innerHTML = 'Join the Waitlist — It\'s Free 🚀';
    });

    // === MODAL ===
    function showSuccessModal(referralCode, position) {
        const codeEl = document.getElementById('userReferralCode');
        const posEl = document.getElementById('userPosition');
        
        if (codeEl) codeEl.textContent = referralCode || 'KHELOFIT-XXX';
        if (posEl) posEl.textContent = position ? `#${position.toLocaleString('en-IN')}` : '#—';

        // Update share links
        const shareText = `I just joined the KheloFit waitlist! India's first AI-powered Health + Sports + Events super app. Join using my referral code: ${referralCode}`;
        const shareUrl = `${window.location.origin}?ref=${referralCode}`;
        
        const waBtn = document.getElementById('shareWhatsApp');
        const twBtn = document.getElementById('shareTwitter');
        
        if (waBtn) waBtn.href = `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
        if (twBtn) twBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

        modal.classList.add('active');
        loadWaitlistCount(); // Refresh count
    }

    // Close modal
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('active');
    });

    document.getElementById('closeModal')?.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Copy referral code
    document.getElementById('copyCode')?.addEventListener('click', () => {
        const code = document.getElementById('userReferralCode').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copyCode');
            btn.textContent = 'Copied! ✓';
            setTimeout(() => btn.textContent = 'Copy', 2000);
        });
    });

    // === FAQ ACCORDION ===
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            // Close all
            faqItems.forEach(i => i.classList.remove('active'));
            // Toggle current
            if (!isActive) item.classList.add('active');
        });
    });

    // === SCROLL ANIMATIONS ===
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.problem-card, .step-card, .lang-card, .feature-block').forEach(el => {
        el.classList.add('animate-target');
        observer.observe(el);
    });

    // === UTILITIES ===
    function validatePhone(phone) {
        return /^[6-9]\d{9}$/.test(phone);
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function shakeEl(el) {
        el.style.borderColor = '#DC2626';
        el.style.animation = 'shake 0.4s ease';
        setTimeout(() => {
            el.style.borderColor = '';
            el.style.animation = '';
        }, 1000);
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});

/* === CSS Injection for dynamic styles === */
const dynamicStyles = document.createElement('style');
dynamicStyles.textContent = `
    .spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        50% { transform: translateX(8px); }
        75% { transform: translateX(-4px); }
    }

    .animate-target {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.5s ease, transform 0.5s ease;
    }

    .animate-in {
        opacity: 1;
        transform: translateY(0);
    }

    .toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 14px 24px;
        border-radius: 12px;
        font-family: 'Poppins', sans-serif;
        font-weight: 600;
        font-size: 0.9rem;
        z-index: 3000;
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 90%;
        text-align: center;
    }

    .toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }

    .toast-success {
        background: #2DC653;
        color: white;
    }

    .toast-error {
        background: #DC2626;
        color: white;
    }
`;
document.head.appendChild(dynamicStyles);
