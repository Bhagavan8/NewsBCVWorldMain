
(function(){
  const UNFILLED_TIMEOUT = 3000; // ms to wait before showing backup

  function showBackupFor(adIns) {
    const container = adIns.closest('.ad-banner-horizontal, .ad-space, .ad-container');
    if (!container) return;
    const backup = container.querySelector('.ad-backup-content');
    if (backup) {
      adIns.style.display = 'none';
      backup.style.display = 'block';
      backup.setAttribute('aria-hidden','false');
    }
  }

  function checkAd(adIns) {
    try {
      // If data-ad-status attribute is 'unfilled' show backup
      const status = adIns.getAttribute('data-ad-status');
      if (status === 'unfilled') {
        showBackupFor(adIns);
        return;
      }
      // If an iframe exists under this ad ins, check its height
      const iframe = adIns.querySelector('iframe') || adIns.parentElement.querySelector('iframe');
      if (iframe) {
        const h = iframe.offsetHeight || iframe.clientHeight || 0;
        if (h < 50) showBackupFor(adIns);
        else {
          // hide backup if any
          const container = adIns.closest('.ad-banner-horizontal, .ad-space, .ad-container');
          if (container) {
            const backup = container.querySelector('.ad-backup-content');
            if (backup) backup.style.display = 'none';
            adIns.style.display = 'block';
          }
        }
      } else {
        // no iframe -> likely unfilled
        showBackupFor(adIns);
      }
    } catch (e) {
      // cross-origin access may fail; rely on timeout fallback below
      console.warn('ad check err', e);
    }
  }

  // Run checks for all ads
  function monitorAllAds() {
    document.querySelectorAll('ins.adsbygoogle').forEach(adIns => {
      // run a check after UNFILLED_TIMEOUT
      setTimeout(() => checkAd(adIns), UNFILLED_TIMEOUT);
      // also run a quick check on load
      checkAd(adIns);
    });
  }

  // Run after the page loads and whenever the adsbygoogle push completes
  document.addEventListener('DOMContentLoaded', monitorAllAds);
  window.addEventListener('load', function() {
    setTimeout(monitorAllAds, 1000);
  });

  // export small debug helper
  window.__showAdDebug = function(){
    document.querySelectorAll('ins.adsbygoogle').forEach((ad, i) => {
      console.log(i+1, 'slot', ad.getAttribute('data-ad-slot'), 'status', ad.getAttribute('data-ad-status'),
                  'rect', ad.getBoundingClientRect(), 'hasIframe', !!ad.querySelector('iframe') || !!ad.parentElement.querySelector('iframe'));
    });
  };
})();

