/* js/adsissue.js
   Safe AdSense initializer + monitor
   - pushes each ins only once
   - lazy-loads in-content ads using IntersectionObserver
   - hides tiny/empty slots to avoid blank space
*/

(function () {
  const UNFILLED_TIMEOUT = 3500;

  function waitForAdsByGoogle(timeout = 5000) {
    return new Promise((resolve) => {
      if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) return resolve(true);
      const start = Date.now();
      const id = setInterval(() => {
        if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
          clearInterval(id);
          return resolve(true);
        }
        if (Date.now() - start > timeout) {
          clearInterval(id);
          return resolve(false);
        }
      }, 250);
    });
  }

  async function initializeAdsOnce() {
    const ready = await waitForAdsByGoogle(5000);
    const nodes = document.querySelectorAll('ins.adsbygoogle');

    nodes.forEach((ins) => {
      // don't push twice
      if (ins._pushed) return;

      // If iframe already present, mark pushed and skip
      const iframeNow = ins.querySelector('iframe') || (ins.parentElement && ins.parentElement.querySelector('iframe'));
      if (iframeNow) {
        ins._pushed = true;
        return;
      }

      // If adsbygoogle is ready, push now. Otherwise schedule a retry.
      if (ready) {
        try {
          (adsbygoogle = window.adsbygoogle || []).push({});
          ins._pushed = true;
        } catch (e) {
          console.warn('ads push failed (initial):', e);
          ins._pushed = false;
        }
      } else {
        // retry after delay
        setTimeout(() => {
          try {
            if (!ins._pushed && window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
              (adsbygoogle = window.adsbygoogle || []).push({});
              ins._pushed = true;
            }
          } catch (e) {
            console.warn('ads push failed (retry):', e);
          }
        }, 2000);
      }
    });
  }

  // Monitor ad slots and hide tiny/empty ones
  function monitorAndHandleAdsImproved() {
    // run after creatives likely loaded
    setTimeout(() => {
      document.querySelectorAll('ins.adsbygoogle').forEach((ins) => {
        try {
          const status = ins.getAttribute('data-ad-status'); // if present
          const container = ins.closest('.ad-banner-horizontal, .ad-space, .ad-section-responsive, .ad-container');

          if (status === 'unfilled') {
            // hide ad element to avoid blank space
            ins.style.display = 'none';
            if (container) container.style.minHeight = '0';
            return;
          }

          // If iframe present, check its height
          const iframe = ins.querySelector('iframe') || (container && container.querySelector('iframe'));
          const height = iframe ? (iframe.offsetHeight || iframe.clientHeight || 0) : 0;
          if (height < 50) {
            // Tiny — likely no creative
            ins.style.display = 'none';
            if (container) container.style.minHeight = '0';
          } else {
            ins.style.display = 'block';
          }
        } catch (e) {
          console.warn('monitor error for ad slot', e);
        }
      });
    }, UNFILLED_TIMEOUT);
  }

  // Lazy init for in-content ads: when element enters viewport, push if not pushed
  function setupLazyForInsertedAds() {
    if (!('IntersectionObserver' in window)) return;
    const options = { threshold: 0.2 };

    document.querySelectorAll('.ad-banner-horizontal').forEach((banner) => {
      // Only observe banners that contain ins.adsbygoogle and are not already handled
      const ins = banner.querySelector('ins.adsbygoogle');
      if (!ins || ins._observerAttached) return;

      const obs = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // push safely
            if (!ins._pushed && window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
              try {
                (adsbygoogle = window.adsbygoogle || []).push({});
                ins._pushed = true;
              } catch (e) {
                console.warn('lazy push failed', e);
              }
            }
            observer.unobserve(entry.target);
          }
        });
      }, options);

      obs.observe(banner);
      ins._observerAttached = true;
    });
  }

  // Combined "safe init" function to call from the page
  async function safeInitAndMonitor() {
    await initializeAdsOnce();
    setupLazyForInsertedAds();
    monitorAndHandleAdsImproved();
  }

  // Expose globally for page scripts to call after dynamic insertion
  window.adsHelper = {
    safeInitAndMonitor,
    initializeAdsOnce,
    monitorAndHandleAdsImproved,
    setupLazyForInsertedAds
  };

  // Auto-run after DOMContentLoaded (non-blocking)
  document.addEventListener('DOMContentLoaded', () => {
    // small delay to let content insertion code run first
    setTimeout(() => {
      safeInitAndMonitor();
    }, 600);
  });

})();
