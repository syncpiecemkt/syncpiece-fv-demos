/* =========================================================
   Syncpiece リニューアル TOP
   GSAP + ScrollTrigger + Lenis（現行テーマと同じ構成）
   ========================================================= */
(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };

  /* ---------- 慣性スクロール（Lenis） ---------- */
  var lenis = null;
  if (!reduceMotion) {
    lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ページ内リンク */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      var target = id === '#top' ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      if (document.body.classList.contains('is-menu-open')) burger.click();
      if (lenis) {
        lenis.scrollTo(target, { offset: 0 });
      } else {
        window.scrollTo({ top: target === 0 ? 0 : target.getBoundingClientRect().top + window.scrollY });
      }
    });
  });

  /* ---------- ヘッダー ---------- */
  // TOPはFVを過ぎたら、下層ページは少しスクロールしたら背景を付ける
  var header = document.getElementById('js-header');
  var fv = document.querySelector('.p-fv');
  ScrollTrigger.create({
    trigger: fv || document.body,
    start: fv ? 'bottom top+=80' : 'top+=80 top',
    end: 'max',
    toggleClass: { targets: header, className: 'is-scrolled' }
  });

  var burger = document.getElementById('js-burger');
  burger.addEventListener('click', function () {
    var open = document.body.classList.toggle('is-menu-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    if (lenis) { open ? lenis.stop() : lenis.start(); }
  });

  /* ---------- 下層ページ：.js-fade が画面に入ったらフェードイン ---------- */
  gsap.utils.toArray('.js-fade').forEach(function (el) {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: function () { el.classList.add('is-shown'); }
    });
  });

  /* ---------- FV：写真をゆっくり動かす ---------- */
  if (!reduceMotion && fv) {
    gsap.fromTo('.p-hero__bg', { yPercent: -4 }, {
      yPercent: 6,
      ease: 'none',
      scrollTrigger: { trigger: '.p-hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    gsap.from('.p-fv__catch, .p-fv__lead', {
      autoAlpha: 0, y: 24, duration: 1.4, ease: 'power3.out', stagger: .25, delay: .2
    });

    /* 見出しまわりのフェードイン */
    gsap.utils.toArray('.c-sec-head, .p-concept__inner, .p-challenge__list > li, .p-services__list > li, .p-about .l-container > *, .p-blog__list > li, .p-contact__inner > *').forEach(function (el) {
      gsap.from(el, {
        autoAlpha: 0, y: 30, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  /* ---------- WORKS：背景のラインを、セクションが画面に入ったら描く ---------- */
  if (document.getElementById('works')) {
    ScrollTrigger.create({
      trigger: '#works',
      start: 'top 75%',
      once: true,
      onEnter: function () { document.getElementById('works').classList.add('is-lines-drawn'); }
    });
  }

  /* ---------- WORKS：スクロール固定で実績が入れ替わる（PCのみ） ---------- */
  var mm = gsap.matchMedia();
  mm.add('(min-width: 768px)', function () {
    var items = gsap.utils.toArray('.p-works__item');
    var images = gsap.utils.toArray('.p-works__gallery li');
    var dots = gsap.utils.toArray('#js-works-dots button');

    var setActive = function (index) {
      items.forEach(function (el, i) { el.classList.toggle('is-active', i === index); });
      images.forEach(function (el, i) { el.classList.toggle('is-active', i === index); });
      dots.forEach(function (el, i) {
        el.classList.toggle('is-active', i === index);
        if (i === index) { el.setAttribute('aria-current', 'true'); } else { el.removeAttribute('aria-current'); }
      });
    };
    setActive(0);

    // ドットを押すと、その実績のテキストが画面中央に来る位置までスクロール
    var onDotClick = function (e) {
      var item = items[dots.indexOf(e.currentTarget)];
      var offset = -(window.innerHeight - item.offsetHeight) / 2;
      if (lenis) {
        lenis.scrollTo(item, { offset: offset });
      } else {
        window.scrollTo({ top: item.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
      }
    };
    dots.forEach(function (el) { el.addEventListener('click', onDotClick); });

    var triggers = items.map(function (item, i) {
      return ScrollTrigger.create({
        trigger: item,
        // テキストの中心が画面中央付近（上下30%の範囲）にある間を表示中とする
        start: 'center 80%',
        end: 'center 20%',
        onToggle: function (self) { if (self.isActive) setActive(i); }
      });
    });

    return function () {
      triggers.forEach(function (t) { t.kill(); });
      dots.forEach(function (el) { el.removeEventListener('click', onDotClick); });
      items.forEach(function (el) { el.classList.remove('is-active'); });
    };
  });

  /* ---------- BEYOND DELIVERY：球体が水平線上を横に移動し、テキストが入れ替わる ---------- */
  var beyond = document.getElementById('js-beyond');
  if (beyond) {
    var balls = gsap.utils.toArray('.p-beyond__ball');
    var texts = gsap.utils.toArray('.p-beyond__text');
    var count = document.getElementById('js-beyond-count');
    var total = balls.length;
    var lastIndex = -1;

    // 球体どうしの間隔。中央に1つあるとき、隣の球体がちょうど画面の外に出る距離
    var gap = 0;
    var measure = function () {
      gap = window.innerWidth / 2 + balls[0].offsetWidth * .6 + 24;
    };
    measure();

    // 各ステップの前後に短い「ため」を作る（12%ずつ静止、間の76%でゆっくり移動）
    var hold = function (s) {
      var k = Math.floor(s);
      var f = s - k;
      var t = clamp((f - .12) / .76, 0, 1);
      t = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
      return k + t;
    };

    // スクロール位置（目標）に、毎フレーム少しずつ近づけて動きをなめらかにする
    var target = 0;
    var current = 0;
    var toPos = function (progress) {
      var s = clamp(progress, 0, 1) * (total - 1);
      return s >= total - 1 ? total - 1 : hold(s);
    };

    var render = function (pos) {
      balls.forEach(function (ball, i) {
        ball.style.transform = 'translate3d(' + ((i - pos) * gap) + 'px, 0, 0)';
      });

      var y = window.innerWidth < 768 ? 56 : 80;
      texts.forEach(function (el, i) {
        var d = pos - i;
        el.style.opacity = clamp(1 - Math.abs(d) * 2.4, 0, 1);
        el.style.transform = 'translateY(' + (-d * y) + 'px)';
        el.style.visibility = Math.abs(d) < .45 ? 'visible' : 'hidden';
      });

      var index = Math.round(pos);
      if (index !== lastIndex) {
        lastIndex = index;
        count.textContent = ('0' + (index + 1)).slice(-2);
      }
    };

    render(0);
    ScrollTrigger.create({
      trigger: beyond,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: function (self) { target = toPos(self.progress); },
      onRefresh: function (self) {
        measure(); // 画面幅が変わったら間隔を測り直す
        target = toPos(self.progress);
        current = target;
        render(current);
      }
    });

    gsap.ticker.add(function () {
      var diff = target - current;
      if (Math.abs(diff) < .0005) {
        if (current !== target) { current = target; render(current); }
        return;
      }
      current += diff * (reduceMotion ? 1 : .08);
      render(current);
    });
  }

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
