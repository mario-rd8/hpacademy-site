document.addEventListener('DOMContentLoaded', () => {

    // ==============================================================
    // HELPER: ENVIO UNIFICADO DE LEADS (SEM N8N — /api/lead)
    // ==============================================================
    async function enviarLead(payload) {
        const res = await fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Erro ao enviar lead');
        return res.json();
    }

    // Máscara de telefone (81) 90000-0000
    function aplicarMascaraLocal(input) {
        if (!input) return;
        input.addEventListener('input', () => {
            let v = input.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
            else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
            input.value = v;
        });
    }

    // Máscara de telefone +55 (81) 90000-0000
    function aplicarMascaraInternacional(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.startsWith('55')) value = value.substring(2);
            if (value.length === 0) {
                e.target.value = '';
                return;
            }
            const x = value.match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            let formatted = '+55';
            if (x[1]) formatted += ' (' + x[1];
            if (x[2]) formatted += ') ' + x[2];
            if (x[3]) formatted += '-' + x[3];
            e.target.value = formatted;
        });
    }

    // ==============================================================
    // 1. HEADER SMART STICKY + PEEK HANDLE
    // ==============================================================
    const header = document.getElementById('main-header');
    const menuHandle = document.getElementById('menu-handle');
    const programasSection = document.getElementById('programas');
    let lastScroll = 0;
    let isMenuHiddenByScroll = false;
    let isHoveringTop = false;
    let autoHideTimer = null;
    let isHoveringHeader = false;

    function clearAutoHideTimer() {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
    }

    function startAutoHideTimer() {
        clearAutoHideTimer();
        if (isHoveringHeader) return;
        autoHideTimer = setTimeout(() => {
            const currentScroll = window.pageYOffset;
            const triggerPoint = programasSection ? programasSection.offsetTop : 550;
            if (isHoveringHeader || isHoveringTop || currentScroll < triggerPoint) return;
            isMenuHiddenByScroll = true;
            header.classList.add('header-hidden-smart');
            if (menuHandle) menuHandle.classList.add('visible');
        }, 3000);
    }

    if (header) {
        header.addEventListener('mouseenter', () => {
            isHoveringHeader = true;
            clearAutoHideTimer();
        });

        header.addEventListener('mouseleave', () => {
            isHoveringHeader = false;
            const currentScroll = window.pageYOffset;
            const triggerPoint = programasSection ? programasSection.offsetTop : 550;
            if (currentScroll >= triggerPoint && !header.classList.contains('header-hidden-smart')) {
                startAutoHideTimer();
            }
        });

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;
            const triggerPoint = programasSection ? programasSection.offsetTop : 550;
            clearAutoHideTimer();

            if (currentScroll > 50) {
                header.classList.remove('header-floating');
                header.classList.add('header-solid');
            } else {
                header.classList.add('header-floating');
                header.classList.remove('header-solid');
            }

            if (currentScroll >= triggerPoint) {
                if (currentScroll > lastScroll) {
                    isMenuHiddenByScroll = true;
                    if (!isHoveringTop) {
                        header.classList.add('header-hidden-smart');
                        if (menuHandle) menuHandle.classList.add('visible');
                    }
                } else {
                    isMenuHiddenByScroll = false;
                    header.classList.remove('header-hidden-smart');
                    if (menuHandle) menuHandle.classList.remove('visible');
                    startAutoHideTimer();
                }
            } else {
                isMenuHiddenByScroll = false;
                header.classList.remove('header-hidden-smart');
                if (menuHandle) menuHandle.classList.remove('visible');
            }
            lastScroll = currentScroll <= 0 ? 0 : currentScroll;
        });

        document.addEventListener('mousemove', (e) => {
            const currentScroll = window.pageYOffset;
            const triggerPoint = programasSection ? programasSection.offsetTop : 550;
            if (currentScroll >= triggerPoint && isMenuHiddenByScroll) {
                if (e.clientY <= 20) {
                    isHoveringTop = true;
                    header.classList.remove('header-hidden-smart');
                    if (menuHandle) menuHandle.classList.remove('visible');
                } else if (e.clientY > 90) {
                    isHoveringTop = false;
                    header.classList.add('header-hidden-smart');
                    if (menuHandle) menuHandle.classList.add('visible');
                }
            }
        });
    }

    // ==============================================================
    // 2. HERO FORMULÁRIO RÁPIDO (Nome + Telefone)
    // ==============================================================
    const heroForm = document.getElementById('hero-form');
    const heroTel = document.getElementById('hero-telefone');
    const heroErr = document.getElementById('hero-err');
    const heroThanks = document.getElementById('hero-thanks');

    aplicarMascaraLocal(heroTel);

    if (heroForm) {
        heroForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = heroForm.querySelector('button[type="submit"]');
            const nome = heroForm.nome.value.trim();
            const telefone = heroTel.value.trim();

            if (!nome) {
                heroErr.textContent = 'Por favor, informe seu nome.';
                return;
            }
            if (telefone.replace(/\D/g, '').length < 10) {
                heroErr.textContent = 'Informe um telefone válido.';
                return;
            }

            btn.disabled = true;
            heroErr.textContent = '';

            try {
                await enviarLead({
                    nome,
                    telefone,
                    origem: 'Hero - Pré-Matrícula'
                });
                heroForm.style.display = 'none';
                heroThanks.style.display = 'block';
            } catch {
                heroErr.textContent = 'Erro ao enviar. Tente novamente.';
                btn.disabled = false;
            }
        });
    }

    // ==============================================================
    // 3. INTERSECTION OBSERVER (MISSÃO) & BACK TO TOP
    // ==============================================================
    const conceitoSection = document.getElementById('conceito');
    if (conceitoSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, { threshold: 0.25 });
        observer.observe(conceitoSection);
    }

    const btnBackToTop = document.getElementById('btn-back-to-top');
    if (btnBackToTop) {
        window.addEventListener('scroll', () => {
            const triggerPoint = programasSection ? programasSection.offsetTop : 550;
            btnBackToTop.classList.toggle('visible', window.pageYOffset >= triggerPoint);
        });
        btnBackToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ==============================================================
    // 4. PROFESSORES (DESKTOP INTERACTION + FORM -> /api/lead)
    // ==============================================================
    const profCards = document.querySelectorAll('.professor-card');

    document.addEventListener('click', (e) => {
        const grid = document.querySelector('.professores-grid');
        if (grid && grid.classList.contains('grid-has-open-form')) {
            const activeCard = document.querySelector('.professor-card.form-locked');
            if (activeCard && !activeCard.contains(e.target)) {
                activeCard.classList.remove('form-locked', 'is-showing-form', 'is-showing-success');
                grid.classList.remove('grid-has-open-form');
            }
        }
    });

    profCards.forEach(card => {
        const btnAgendar = card.querySelector('.btn-step1');
        const form = card.querySelector('.lead-form');
        const telInput = card.querySelector('.tel-mask');

        aplicarMascaraInternacional(telInput);

        card.addEventListener('click', () => {
            const grid = document.querySelector('.professores-grid');
            if (grid && grid.classList.contains('grid-has-open-form') && !card.classList.contains('form-locked')) {
                profCards.forEach(c => c.classList.remove('form-locked', 'is-showing-form', 'is-showing-success'));
                grid.classList.remove('grid-has-open-form');
            }
        });

        if (btnAgendar) {
            btnAgendar.addEventListener('click', (e) => {
                e.stopPropagation();
                profCards.forEach(c => c.classList.remove('form-locked', 'is-showing-form', 'is-showing-success'));
                const grid = document.querySelector('.professores-grid');
                if (grid) grid.classList.add('grid-has-open-form');
                card.classList.add('form-locked', 'is-showing-form');
            });
        }

        if (form) {
            form.setAttribute('novalidate', 'true');

            const showTooltip = (input, msg) => {
                let wrapper = input.parentNode;
                if (!wrapper.classList.contains('input-wrapper')) {
                    wrapper = document.createElement('div');
                    wrapper.className = 'input-wrapper';
                    wrapper.style.position = 'relative';
                    wrapper.style.width = '100%';
                    input.parentNode.insertBefore(wrapper, input);
                    wrapper.appendChild(input);
                }
                let tooltip = wrapper.querySelector('.custom-tooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.className = 'custom-tooltip';
                    wrapper.appendChild(tooltip);
                }
                tooltip.textContent = msg;
                tooltip.offsetHeight;
                tooltip.classList.add('show');
                setTimeout(() => tooltip.classList.remove('show'), 2500);
            };

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nomeInput = form.querySelector('input[name="nome"]');
                const telInputEl = form.querySelector('input[name="telefone"]');
                const lgpdCheckbox = form.querySelector('input[name="lgpd"]');

                let hasError = false;
                if (nomeInput && !nomeInput.value.trim()) {
                    showTooltip(nomeInput, 'Preencha seu nome');
                    hasError = true;
                }
                if (telInputEl && telInputEl.value.replace(/\D/g, '').length < 10) {
                    showTooltip(telInputEl, 'Telefone inválido');
                    hasError = true;
                }
                if (lgpdCheckbox && !lgpdCheckbox.checked) {
                    const labelSpan = form.querySelector('.lgpd-checkbox span');
                    if (labelSpan) {
                        labelSpan.classList.add('flash-error');
                        setTimeout(() => labelSpan.classList.remove('flash-error'), 1000);
                    }
                    hasError = true;
                }
                if (hasError) return;

                card.classList.remove('is-showing-form');
                card.classList.add('is-showing-success');

                const data = Object.fromEntries(new FormData(form).entries());
                enviarLead(data).catch(console.error);

                setTimeout(() => {
                    card.classList.remove('is-showing-success', 'form-locked');
                    const grid = document.querySelector('.professores-grid');
                    if (grid) grid.classList.remove('grid-has-open-form');
                    form.reset();
                }, 3500);
            });
        }
    });

    // ==============================================================
    // 5. GALERIA ESTRUTURA
    // ==============================================================
    const galleryImages = [
        'assets/Fotos/Estrutura/HP-fachada-predio.png',
        'assets/Fotos/Estrutura/estrutura_Sala de aula 1.png',
        'assets/Fotos/Estrutura/estrutura_Sala de Aula 2.png'
    ];

    const imgPrincipal = document.getElementById('img-principal');
    const thumbnails = document.querySelectorAll('.miniatura');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const galeriaArea = document.getElementById('galeria-estrutura');

    if (imgPrincipal) {
        let currentIndex = 0;
        let autoPlayInterval;

        function updateGallery(index) {
            imgPrincipal.classList.add('transitioning');
            setTimeout(() => {
                currentIndex = (index + galleryImages.length) % galleryImages.length;
                imgPrincipal.src = galleryImages[currentIndex];
                setTimeout(() => imgPrincipal.classList.remove('transitioning'), 50);
                thumbnails.forEach(thumb => {
                    thumb.classList.toggle('active', parseInt(thumb.getAttribute('data-index')) === currentIndex);
                });
            }, 300);
        }

        function startAutoPlay() {
            stopAutoPlay();
            autoPlayInterval = setInterval(() => updateGallery(currentIndex + 1), 4500);
        }

        function stopAutoPlay() {
            if (autoPlayInterval) clearInterval(autoPlayInterval);
        }

        if (btnPrev) btnPrev.addEventListener('click', () => { updateGallery(currentIndex - 1); startAutoPlay(); });
        if (btnNext) btnNext.addEventListener('click', () => { updateGallery(currentIndex + 1); startAutoPlay(); });

        thumbnails.forEach(thumb => {
            thumb.addEventListener('click', () => {
                updateGallery(parseInt(thumb.getAttribute('data-index')));
                startAutoPlay();
            });
        });

        if (galeriaArea) {
            galeriaArea.addEventListener('mouseenter', stopAutoPlay);
            galeriaArea.addEventListener('mouseleave', startAutoPlay);
        }

        let touchStartX = 0;
        imgPrincipal.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        imgPrincipal.addEventListener('touchend', e => {
            const diff = e.changedTouches[0].screenX - touchStartX;
            if (diff < -50) { updateGallery(currentIndex + 1); startAutoPlay(); }
            else if (diff > 50) { updateGallery(currentIndex - 1); startAutoPlay(); }
        }, { passive: true });

        startAutoPlay();
    }

    // ==============================================================
    // 6. FORMULÁRIO HORIZONTAL FINAL -> /api/lead
    // ==============================================================
    const formContato = document.getElementById('form-contato');
    const phoneInputContato = document.getElementById('telefone');

    aplicarMascaraInternacional(phoneInputContato);

    if (formContato) {
        formContato.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.querySelector('.contato-titulo');
            const timerContainer = document.getElementById('contato-timer-container');
            const originalTitleText = title.innerText;
            const btnSubmit = formContato.querySelector('.btn-submit');
            if (btnSubmit) btnSubmit.disabled = true;

            formContato.style.transition = 'opacity 0.3s ease';
            formContato.style.opacity = '0';
            title.innerText = 'Estamos enviando seus dados...';

            const data = Object.fromEntries(new FormData(formContato).entries());
            enviarLead(data).catch(console.error);

            setTimeout(() => {
                formContato.style.display = 'none';
                timerContainer.style.display = 'block';
                void timerContainer.offsetWidth;
                timerContainer.classList.add('animating');

                setTimeout(() => {
                    title.style.opacity = '0';
                    setTimeout(() => {
                        title.innerText = 'Obrigado! Em breve entraremos em contato.';
                        title.style.opacity = '1';
                    }, 300);
                }, 1700);

                setTimeout(() => {
                    title.style.opacity = '0';
                    timerContainer.style.opacity = '0';
                    setTimeout(() => {
                        timerContainer.style.display = 'none';
                        timerContainer.classList.remove('animating');
                        timerContainer.style.opacity = '1';

                        title.innerText = originalTitleText;
                        title.style.opacity = '1';

                        formContato.reset();
                        if (btnSubmit) btnSubmit.disabled = false;
                        formContato.style.display = 'flex';
                        void formContato.offsetWidth;
                        formContato.style.opacity = '1';
                    }, 300);
                }, 3200);
            }, 300);
        });
    }

    // ==============================================================
    // 7. MOBILE FAB MENU
    // ==============================================================
    const mobileFab = document.getElementById('mobile-fab');
    const mobileOverlay = document.getElementById('mobile-menu-overlay');

    if (mobileFab && mobileOverlay) {
        const closeMobileMenu = () => document.body.classList.remove('mobile-menu-open');
        mobileFab.addEventListener('click', () => document.body.classList.toggle('mobile-menu-open'));

        mobileOverlay.querySelectorAll('.mobile-menu-nav a').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    closeMobileMenu();
                    setTimeout(() => {
                        const target = document.querySelector(href);
                        if (target) target.scrollIntoView({ behavior: 'smooth' });
                    }, 350);
                } else {
                    closeMobileMenu();
                }
            });
        });

        mobileOverlay.addEventListener('click', (e) => {
            if (e.target === mobileOverlay) closeMobileMenu();
        });
    }

    // ==============================================================
    // 8. MODAL DINÂMICO (ESTRUTURA, RODAPÉ E PROFESSORES MOBILE) -> /api/lead
    // ==============================================================
    const modalVisita = document.getElementById('modal-visita');
    const gatilhosModal = document.querySelectorAll('.btn-pilula, .btn-footer-cta, .footer-contatos .contato-item[data-origem]');
    const btnFecharVisita = document.getElementById('btn-close-modal');
    const formVisita = document.getElementById('form-visita');
    const formVisitaContent = document.getElementById('visita-form-content');
    const successVisitaState = document.getElementById('visita-success-state');
    const progressVisitaFill = document.getElementById('visita-progress-fill');

    let origemAtual = '';
    let mensagemAtual = '';
    let professorAtual = '';

    if (modalVisita && formVisita) {
        aplicarMascaraInternacional(formVisita.querySelector('.tel-mask'));

        const resetModal = () => {
            const titulo = modalVisita.querySelector('.modal-titulo');
            const sub = modalVisita.querySelector('.modal-subtitulo');
            if (titulo) titulo.textContent = 'Agende sua visita';
            if (sub) sub.textContent = 'Conheça nosso espaço smart no Grand Tower Shopping.';
            origemAtual = '';
            mensagemAtual = '';
            professorAtual = '';
        };

        const closeVisita = () => {
            modalVisita.classList.remove('active');
            setTimeout(() => {
                formVisita.reset();
                formVisitaContent.style.display = 'block';
                successVisitaState.style.display = 'none';
                progressVisitaFill.classList.remove('animating');
                resetModal();
            }, 300);
        };

        gatilhosModal.forEach(gatilho => {
            gatilho.addEventListener('click', (e) => {
                e.preventDefault();
                resetModal();
                origemAtual = gatilho.getAttribute('data-origem') || 'Site HP Academy';
                mensagemAtual = gatilho.getAttribute('data-mensagem') || '';
                modalVisita.classList.add('active');
            });
        });

        if (btnFecharVisita) btnFecharVisita.addEventListener('click', closeVisita);
        modalVisita.addEventListener('click', (e) => {
            if (e.target === modalVisita) closeVisita();
        });

        formVisita.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(formVisita).entries());
            data.origem = origemAtual || 'Modal - HP Academy';
            if (professorAtual) data.professor = professorAtual;

            formVisitaContent.style.display = 'none';
            successVisitaState.style.display = 'block';
            setTimeout(() => progressVisitaFill.classList.add('animating'), 20);

            enviarLead(data).catch(console.error);

            setTimeout(() => {
                if (mensagemAtual) {
                    const url = 'https://wa.me/5581985008282?text=' + encodeURIComponent(mensagemAtual);
                    window.open(url, '_blank');
                }
                closeVisita();
            }, 2200);
        });

        // Acordeão Mobile de Professores
        if (window.innerWidth <= 768) {
            profCards.forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-mobile-prof')) return;
                    if (card.classList.contains('mobile-active')) {
                        card.classList.remove('mobile-active');
                        return;
                    }
                    profCards.forEach(c => c.classList.remove('mobile-active'));
                    card.classList.add('mobile-active');
                });
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.professor-card')) {
                    profCards.forEach(c => c.classList.remove('mobile-active'));
                }
            });

            document.querySelectorAll('.btn-mobile-prof').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    professorAtual = btn.getAttribute('data-professor') || '';
                    origemAtual = btn.getAttribute('data-origem') || 'Professores Mobile';
                    mensagemAtual = '';

                    const nomeProf = professorAtual.split(' - ')[0];
                    const titulo = modalVisita.querySelector('.modal-titulo');
                    const sub = modalVisita.querySelector('.modal-subtitulo');
                    if (titulo) titulo.textContent = `Mande um "oi" para ${nomeProf}! 👋`;
                    if (sub) sub.textContent = 'Deixe seu nome e WhatsApp para receber o retorno.';
                    modalVisita.classList.add('active');
                });
            });
        }
    }
});
