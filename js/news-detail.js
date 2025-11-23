// news-detail.js
import { auth, db } from './firebase-config.js';
import {
    doc,
    getDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    collection,
    updateDoc,
    increment,
    arrayUnion,
    setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import { ArticleNavigation } from './article-navigation.js';
import { relatedArticles } from './related-articles.js';
import { CommentsManager } from './comments.js';

// Utility functions
function showLoader() {
    const loader = document.querySelector('.loader-container');
    if (loader) loader.classList.remove('loader-hidden');
}

function hideLoader() {
    const loader = document.querySelector('.loader-container');
    if (loader) loader.classList.add('loader-hidden');
}

function formatDate(timestamp) {
    if (!timestamp) return '';

    // Handle Firestore Timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function setupShareButtons(newsData) {
    const shareUrl = window.location.href;
    const shareTitle = newsData.title;

    const fb = document.querySelector('.share-btn.facebook');
    const tw = document.querySelector('.share-btn.twitter');
    const wa = document.querySelector('.share-btn.whatsapp');

    if (fb) {
        fb.onclick = () => {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
        };
    }
    if (tw) {
        tw.onclick = () => {
            window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`, '_blank');
        };
    }
    if (wa) {
        wa.onclick = () => {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareTitle + ' ' + shareUrl)}`, '_blank');
        };
    }
}

// AD FIX: Enhanced function to initialize all ads (safe: push each only once)
function initializeAds() {
    try {
        console.log('🔄 initializeAds(): checking ad units...');
        document.querySelectorAll('ins.adsbygoogle').forEach((unit, index) => {
            try {
                if (unit._pushed) return; // already pushed
                unit.style.display = 'block';
                unit.style.visibility = 'visible';
                // safe push
                if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
                    try {
                        window.adsbygoogle.push({});
                        unit._pushed = true;
                        console.log(`✅ Ad unit ${index + 1} pushed`);
                    } catch (pushErr) {
                        console.warn('Ad push error', pushErr);
                    }
                } else {
                    // retry shortly if the library isn't ready yet
                    setTimeout(() => {
                        if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
                            try {
                                window.adsbygoogle.push({});
                                unit._pushed = true;
                                console.log(`✅ Ad unit ${index + 1} pushed on retry`);
                            } catch (pushErr) {
                                console.warn('Ad push retry failed', pushErr);
                            }
                        }
                    }, 2000);
                }
            } catch (e) {
                console.error('Error initializing ad unit:', e);
            }
        });
    } catch (err) {
        console.error('initializeAds error', err);
    }
}

// AD FIX: Enhanced function to check and fix ad containers
function fixAdContainers() {
    console.log('🔧 Fixing ad containers...');
    const adSpaces = document.querySelectorAll('.ad-space, .ad-banner-horizontal, .ad-section-responsive');
    adSpaces.forEach((space, index) => {
        try {
            // Visual rules for the container (safe, minimal)
            space.style.display = 'block';
            space.style.overflow = 'visible';
            space.style.contain = 'none';
            space.style.position = 'relative';
            space.style.visibility = 'visible';
            space.style.opacity = '1';

            // Reasonable minimums
            if (space.classList.contains('vertical-ad')) {
                space.style.minHeight = '400px';
            } else if (space.classList.contains('sidebar-ad')) {
                space.style.minHeight = '250px';
            } else {
                space.style.minHeight = '120px';
            }

            const ad = space.querySelector('ins.adsbygoogle');
            if (ad) {
                ad.style.display = 'block';
                ad.style.width = '100%';
                ad.style.minHeight = space.classList.contains('vertical-ad') ? '400px' : '120px';
                ad.style.height = 'auto';
                ad.style.overflow = 'visible';
                ad.style.contain = 'none';
                ad.style.visibility = 'visible';
                ad.style.opacity = '1';
                console.log(`✅ Fixed ad container ${index + 1}`);
            }
        } catch (e) {
            console.warn('fixAdContainers error for container', index, e);
        }
    });
}

// AD FIX: Function to handle ad status monitoring (without backup content)
function monitorAndHandleAds() {
    // run checks after a short delay to give creatives time
    setTimeout(() => {
        const ads = document.querySelectorAll('ins.adsbygoogle');
        console.log(`🔍 Monitoring ${ads.length} ad units for status...`);

        ads.forEach((ad) => {
            try {
                const status = ad.getAttribute('data-ad-status');
                const container = ad.closest('.ad-container, .ad-banner-horizontal, .ad-section-responsive');

                // If explicit unfilled status, hide the ad element to avoid blank iframe
                if (status === 'unfilled') {
                    console.log(`❌ Ad unfilled for slot ${ad.getAttribute('data-ad-slot')}. Hiding ad element.`);
                    ad.style.display = 'none';
                    if (container) container.style.minHeight = '0';
                    return;
                }

                // Otherwise use iframe height heuristic and hide if tiny
                const iframe = ad.querySelector('iframe') || (container && container.querySelector('iframe'));
                const h = iframe ? (iframe.offsetHeight || iframe.clientHeight || 0) : 0;
                if (h < 50) {
                    console.log(`❌ Ad iframe tiny (${h}px) for slot ${ad.getAttribute('data-ad-slot')}. Hiding ad element.`);
                    ad.style.display = 'none';
                    if (container) container.style.minHeight = '0';
                } else {
                    // visible creative
                    ad.style.display = 'block';
                }
            } catch (e) {
                console.warn('monitorAndHandleAds error', e);
            }
        });
    }, 3000);
}

async function incrementViewCount(newsId) {
    try {
        const isLoggedIn = auth.currentUser !== null;

        if (!isLoggedIn) {
            const viewedNews = sessionStorage.getItem('viewedNews') || '';
            const viewedNewsArray = viewedNews ? viewedNews.split(',') : [];

            if (viewedNewsArray.includes(newsId)) {
                return;
            }

            viewedNewsArray.push(newsId);
            sessionStorage.setItem('viewedNews', viewedNewsArray.join(','));
        } else {
            const userViewsRef = doc(db, 'userViews', auth.currentUser.uid);
            const userViewsDoc = await getDoc(userViewsRef);

            if (!userViewsDoc.exists()) {
                // Create the document if it doesn't exist
                await setDoc(userViewsRef, {
                    viewedNews: [newsId]
                });
            } else if (!userViewsDoc.data().viewedNews?.includes(newsId)) {
                // Update existing document
                await updateDoc(userViewsRef, {
                    viewedNews: arrayUnion(newsId)
                });
            } else {
                return; // Already viewed
            }
        }

        // Increment view count
        const newsRef = doc(db, 'news', newsId);
        await updateDoc(newsRef, {
            views: increment(1)
        });
    } catch (error) {
        console.error('Error updating view count:', error);
    }
}

function displayNewsDetail(newsData) {
    try {
        const categoryLink = document.querySelector('.category-link');
        const newsTitle = document.querySelector('.news-title');

        if (newsTitle) {
            newsTitle.textContent = newsData.title.length > 50
                ? newsData.title.substring(0, 50) + '...'
                : newsData.title;
        }

        // Update category badge
        const categoryBadge = document.querySelector('.category-badge');
        if (categoryBadge) {
            if (newsData.category) {
                categoryBadge.textContent = newsData.category.charAt(0).toUpperCase() + newsData.category.slice(1);
            } else {
                categoryBadge.textContent = '';
            }
            categoryBadge.classList.add('animate-badge');
        }

        // Update article details
        const articleTitleEl = document.querySelector('.article-title');
        if (articleTitleEl) articleTitleEl.textContent = newsData.title || '';

        const authorEl = document.querySelector('.author');
        if (authorEl) authorEl.textContent = `By ${newsData.authorName || 'Anonymous'}`;

        const dateElement = document.querySelector('.date');
        if (dateElement && newsData.createdAt) {
            dateElement.textContent = formatDate(newsData.createdAt);
        }

        // Split content into paragraphs and add ads between them (safe DOM insertion)
        const paragraphs = (newsData.content || '').split('\n\n');
        const contentContainer = document.querySelector('.article-content');
        if (!contentContainer) return;

        // clear container first
        contentContainer.innerHTML = '';

        const UNFILLED_PUSH_FALLBACK_MS = 5000;

        paragraphs.forEach((paragraph, index) => {
            // safe paragraph insertion
            const p = document.createElement('p');
            p.textContent = paragraph;
            contentContainer.appendChild(p);

            // insert ad every 3 paragraphs (except after last)
            if ((index + 1) % 3 === 0 && index < paragraphs.length - 1) {
                const adSection = document.createElement('div');
                adSection.className = 'ad-section-responsive my-4';

                const adBanner = document.createElement('div');
                adBanner.className = 'ad-banner-horizontal';
                adBanner.id = `in-content-ad-${index}`;

                const ins = document.createElement('ins');
                ins.className = 'adsbygoogle';
                ins.style.display = 'block';
                ins.setAttribute('data-ad-client', 'ca-pub-6284022198338659');
                ins.setAttribute('data-ad-slot', '6412063350');
                ins.setAttribute('data-ad-format', 'auto');
                ins.setAttribute('data-full-width-responsive', 'true');

                adBanner.appendChild(ins);
                adSection.appendChild(adBanner);
                contentContainer.appendChild(adSection);

                // safe push helper
                const pushAdSafely = () => {
                    if (ins._pushed) return;
                    if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
                        try {
                            window.adsbygoogle.push({});
                            ins._pushed = true;
                        } catch (e) {
                            console.warn('ads push failed', e);
                        }
                    } else {
                        setTimeout(() => {
                            if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
                                try {
                                    window.adsbygoogle.push({});
                                    ins._pushed = true;
                                } catch (e) {
                                    console.warn('ads push retry failed', e);
                                }
                            }
                        }, UNFILLED_PUSH_FALLBACK_MS);
                    }
                };

                // lazy-init when visible (recommended)
                if ('IntersectionObserver' in window) {
                    const obs = new IntersectionObserver((entries, o) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                pushAdSafely();
                                o.unobserve(entry.target);
                                // check iframe height after a short wait and hide if tiny
                                setTimeout(() => {
                                    const iframe = ins.querySelector('iframe') || adBanner.querySelector('iframe');
                                    const h = iframe ? (iframe.offsetHeight || iframe.clientHeight || 0) : 0;
                                    if (h < 50) {
                                        ins.style.display = 'none';
                                        adBanner.style.minHeight = '0';
                                    } else {
                                        ins.style.display = 'block';
                                    }
                                }, 3000);
                            }
                        });
                    }, { threshold: 0.25 });
                    obs.observe(adBanner);
                } else {
                    // fallback: push immediately
                    pushAdSafely();
                    setTimeout(() => {
                        const iframe = ins.querySelector('iframe') || adBanner.querySelector('iframe');
                        const h = iframe ? (iframe.offsetHeight || iframe.clientHeight || 0) : 0;
                        if (h < 50) {
                            ins.style.display = 'none';
                            adBanner.style.minHeight = '0';
                        } else {
                            ins.style.display = 'block';
                        }
                    }, 3000);
                }
            }
        });

        // Fix containers and initialize ads for any inserted ad slots
        setTimeout(() => {
            fixAdContainers();
            initializeAds();
            monitorAndHandleAds();
        }, 800);

        // Featured image
        const imageContainer = document.querySelector('.featured-image-container');
        if (imageContainer && newsData.imagePath) {
            imageContainer.innerHTML = `
                <img src="${newsData.imagePath}" 
                     alt="${newsData.title || ''}"
                     class="img-fluid rounded shadow-sm">
                <figcaption class="text-muted mt-2 text-center">
                    ${newsData.imageCaption || ''}
                </figcaption>`;
        }

        setupShareButtons(newsData);
    } catch (e) {
        console.error('displayNewsDetail error', e);
    }
}

async function loadRelatedNews(category) {
    try {
        if (!category) {
            console.warn('Category is undefined, skipping related news load');
            return;
        }

        const relatedQuery = query(collection(db, 'news'), where('category', '==', category), limit(4));
        const snapshot = await getDocs(relatedQuery);
        const container = document.getElementById('categoryNewsContainer');

        if (container && !snapshot.empty) {
            container.innerHTML = snapshot.docs.map(d => {
                const news = d.data();
                return `
                    <div class="related-news-item mb-3">
                        <a href="news-detail.html?id=${d.id}" class="text-decoration-none">
                            <div class="d-flex align-items-center">
                                <img src="${news.imagePath || ''}" alt="${news.title}" 
                                     class="related-thumb me-3" 
                                     style="width: 100px; height: 60px; object-fit: cover;">
                                <h6 class="mb-0 text-dark">${news.title}</h6>
                            </div>
                        </a>
                    </div>`;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading related news:', error);
    }
}

async function loadLatestNews() {
    try {
        const last24Hours = new Date();
        last24Hours.setHours(last24Hours.getHours() - 24);

        const latestQuery = query(collection(db, 'news'), where('createdAt', '>=', last24Hours), orderBy('createdAt', 'desc'), limit(5));
        const snapshot = await getDocs(latestQuery);
        const container = document.getElementById('latestNewsContainer');

        if (container && !snapshot.empty) {
            container.innerHTML = snapshot.docs.map(d => {
                const news = d.data();
                return `
                    <div class="latest-news-item mb-3 p-2 border-bottom">
                        <a href="news-detail.html?id=${d.id}" class="text-decoration-none">
                            <div class="d-flex align-items-start">
                                <div class="latest-thumb me-3 position-relative">
                                    <img src="${news.imagePath || '/assets/images/placeholder.jpg'}" 
                                         alt="${news.title}"
                                         style="width: 100px; height: 60px; object-fit: cover; border-radius: 4px;">
                                    <span class="badge bg-primary position-absolute" 
                                          style="font-size: 0.65rem; padding: 0.2rem 0.4rem; bottom: 4px; left: 4px;">
                                      ${news.category ? (news.category.charAt(0).toUpperCase() + news.category.slice(1)) : ''}
                                    </span>
                                </div>
                                <div class="flex-grow-1">
                                    <h6 class="mb-1 text-dark">${news.title.length > 30 ? news.title.substring(0, 30) + '...' : news.title}</h6>
                                    <small class="text-muted d-inline-block" style="font-size: 0.7rem; white-space: nowrap;">
                                        <i class="bi bi-clock"></i> ${formatDate(news.createdAt)}
                                    </small>
                                </div>
                            </div>
                        </a>
                    </div>`;
            }).join('');
        } else if (container) {
            container.innerHTML = `<p class="text-muted">No recent news available</p>`;
        }
    } catch (error) {
        console.error('Error loading latest news:', error);
    }
}

async function loadPopularNews() {
    try {
        const popularQuery = query(collection(db, 'news'), limit(10));
        const snapshot = await getDocs(popularQuery);
        const container = document.getElementById('popularNewsContainer');

        if (container && !snapshot.empty) {
            const sortedDocs = snapshot.docs
                .filter(d => {
                    const data = d.data();
                    return data.views && data.approvalStatus === 'approved';
                })
                .sort((a, b) => (b.data().views || 0) - (a.data().views || 0))
                .slice(0, 5);

            container.innerHTML = sortedDocs.map((d, index) => {
                const news = d.data();
                return `
                    <div class="popular-news-item mb-3">
                        <a href="news-detail.html?id=${d.id}" class="text-decoration-none">
                            <div class="d-flex align-items-center">
                                <div class="position-relative me-3">
                                    <span class="number-badge">${index + 1}</span>
                                </div>
                                <div>
                                    <h6 class="mb-1 text-dark">${news.title}</h6>
                                    <small class="text-muted">
                                        <i class="bi bi-eye"></i> ${news.views || 0} views
                                    </small>
                                </div>
                            </div>
                        </a>
                    </div>`;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading popular news:', error);
    }
}

async function loadCategoryNews(category) {
    try {
        console.log('Category received:', category);
        if (!category) {
            console.warn('Category is undefined, skipping category news load');
            return;
        }

        const categoryQuery = query(collection(db, 'news'), where('category', '==', category), limit(5));
        const snapshot = await getDocs(categoryQuery);
        const container = document.getElementById('categoryNewsContainer');

        if (container && !snapshot.empty) {
            container.innerHTML = `
                <h5 class="mb-3">More from ${category.charAt(0).toUpperCase() + category.slice(1)}</h5>
                ${snapshot.docs.map(d => {
                    const news = d.data();
                    return `
                        <div class="category-news-item mb-3">
                            <a href="news-detail.html?id=${d.id}" class="text-decoration-none">
                                <div class="d-flex align-items-center">
                                    <img src="${news.imagePath || '/assets/images/placeholder.jpg'}" 
                                         alt="${news.title}" 
                                         class="category-thumb me-3" 
                                         style="width: 80px; height: 50px; object-fit: cover;">
                                    <div>
                                        <h6 class="mb-1 text-dark">${news.title}</h6>
                                        <small class="text-muted">${formatDate(news.createdAt)}</small>
                                    </div>
                                </div>
                            </a>
                        </div>`;
                }).join('')}`;
        }
    } catch (error) {
        console.error('Error loading category news:', error);
    }
}

// Main loader for news detail
async function loadNewsDetail() {
    try {
        showLoader();
        const urlParams = new URLSearchParams(window.location.search);
        const newsId = urlParams.get('id');

        if (!newsId) {
            console.warn('No news ID provided');
            window.location.href = 'index.html';
            return;
        }

        const docRef = doc(db, 'news', newsId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.warn('News document not found');
            window.location.href = 'index.html';
            return;
        }

        const newsData = {
            id: newsId,
            ...docSnap.data()
        };

        // Display the news content first
        await displayNewsDetail(newsData);

        // Initialize components after ensuring we have valid data
        const commentsManager = new CommentsManager(newsId);
        const navigation = new ArticleNavigation();

        // Use the imported relatedArticles instance
        await relatedArticles.loadRelatedArticles(newsData);

        // Only proceed with related content if we have a valid category
        if (newsData.category) {
            await Promise.all([
                loadRelatedNews(newsData.category),
                loadCategoryNews(newsData.category),
                loadLatestNews(),
                loadPopularNews(),
                incrementViewCount(newsId)
            ]);

            // Initialize comments after other content is loaded
            await commentsManager.initialize();
        } else {
            console.warn('News category is undefined');
        }
    } catch (error) {
        console.error("Error loading news:", error);
        console.log('Error details:', error.message);
    } finally {
        hideLoader();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadNewsDetail);

// Reading progress
window.addEventListener('scroll', () => {
    const docElement = document.documentElement;
    const percentScrolled = (docElement.scrollTop / (docElement.scrollHeight - docElement.clientHeight)) * 100;
    document.documentElement.style.setProperty('--scroll', `${percentScrolled}%`);
});

// Fix ad containers on resize (debounced small delay)
window.addEventListener('resize', () => {
    setTimeout(fixAdContainers, 500);
});

// Export functions for global access if needed
window.initializeAds = initializeAds;
window.fixAdContainers = fixAdContainers;
window.monitorAndHandleAds = monitorAndHandleAds;
