import React, {useEffect, useRef} from 'react';
import Layout from '@theme/Layout';
import {translate} from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import '../css/flowtrack.css';

// 落地页（开物智造 FlowTrack）：文案中文为内联默认（zh 站直接生效），
// 英文在 i18n/en/code.json 的 flowtrackLp.* 键；渲染差异只走 currentLocale（hydration 安全）。

const t = (id: string, message: string): string => translate({id, message});

// Hero 路线几何：5 节点等距，x 起点 80、间距 200，进度线宽 800
const NS_X = [80, 280, 480, 680, 880] as const;
const NS_Y = 118;
const PROP_W = 800;
const HERO_DAYS = [1, 2, 1, 2, 1];

// 画布节点：手工摆放（x,y = 左上角锚点；与连线端点对齐）；[x, y, key, 中文默认名, 工期]
const CV_NODES: ReadonlyArray<readonly [number, number, string, string, number]> = [
  [60, 116, 'pCut', '下料', 1],
  [236, 116, 'pMac', '机加', 2],
  [464, 116, 'pWeld', '焊接', 1],
  [464, 212, 'pHeat', '热处理', 1],
  [692, 72, 'pAsm', '组装', 2],
  [900, 116, 'pInsp', '检验', 1],
];

// 画布结点圆（连线端点/拐点，与 d 内坐标一致）
const CV_JUNCTIONS = [
  [200, 116], [236, 116], [376, 116], [420, 116], [464, 116], [420, 212],
  [464, 212], [604, 116], [648, 116], [604, 212], [648, 212], [648, 72],
  [692, 72], [832, 72], [876, 72], [876, 116], [900, 116],
] as const;

export default function FlowTrackLp(): React.ReactElement {
  const {
    i18n: {currentLocale},
  } = useDocusaurusContext();
  const isZh = currentLocale === 'zh';

  const dayUnit = t('flowtrackLp.dayUnit', ' 天');
  const toolbarUnit = t('flowtrackLp.toolbarUnit', ' 天');
  const heroNames = [
    t('flowtrackLp.pCut', '下料'),
    t('flowtrackLp.pMac', '机加'),
    t('flowtrackLp.pWeld', '焊接'),
    t('flowtrackLp.pAsm', '组装'),
    t('flowtrackLp.pInsp', '检验'),
  ];
  const heatName = t('flowtrackLp.pHeat', '热处理');

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const daysRef = useRef<HTMLSpanElement>(null);
  const stepRef = useRef<HTMLSpanElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Hero 动画：报工推进 → 倒计时 3 → 跳 2 + 预警 → 淡出复位，10s 循环；
  // prefers-reduced-motion 直接呈现预警终态。
  useEffect(() => {
    const root = stageRef.current;
    if (!root) {
      return undefined;
    }
    const card = cardRef.current;
    const chip = chipRef.current;
    const elDays = daysRef.current;
    const elStep = stepRef.current;
    const elCur = curRef.current;
    const dot = root.querySelector<SVGGElement>('.flowdot');
    const prop = root.querySelector<SVGRectElement>('.propline');
    const cap = root.querySelector<HTMLElement>('.stage-cap');
    if (!chip || !elDays || !elStep || !elCur || !dot || !prop || !card) {
      return undefined;
    }

    const names = [
      translate({id: 'flowtrackLp.pCut', message: '下料'}),
      translate({id: 'flowtrackLp.pMac', message: '机加'}),
      translate({id: 'flowtrackLp.pWeld', message: '焊接'}),
      translate({id: 'flowtrackLp.pAsm', message: '组装'}),
      translate({id: 'flowtrackLp.pInsp', message: '检验'}),
    ];
    const chipOk = translate({id: 'flowtrackLp.chipOk', message: '正常'});
    const chipWarn = translate({id: 'flowtrackLp.chipWarn', message: '交期预警'});

    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };

    const setState = (done: number, cur: number, days: number, warn: boolean) => {
      root.querySelectorAll<SVGGElement>('.node').forEach((n, i) => {
        n.classList.toggle('is-ok', i < done);
        n.classList.toggle('is-cur', i === cur);
      });
      dot.style.transform = `translate(${NS_X[cur]}px, ${NS_Y}px)`;
      prop.style.transform = `scaleX(${(NS_X[done] - 80) / PROP_W})`;
      elDays.textContent = String(days);
      elStep.textContent = String(done + 1);
      elCur.textContent = names[cur];
      chip.textContent = warn ? chipWarn : chipOk;
      chip.className = `chip ${warn ? 'chip-warn' : 'chip-ok'}`;
      card.classList.toggle('warn', warn);
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setState(3, 3, 2, true);
      if (cap) {
        cap.textContent = translate({
          id: 'flowtrackLp.stageCapStatic',
          message: '工单推进到第 3 道时，剩余天数已不足以做完剩余工序，预警出现在首页。',
        });
      }
    } else {
      (function loop() {
        setState(2, 2, 4, false); // 焊接进行中 · 剩 4 天
        wait(2000, () => setState(3, 3, 3, false)); // 焊接完成进入组装 · 剩 3 天
        wait(3800, () => setState(3, 3, 2, true)); // 倒计时跳 2 天 · 预警出现
        wait(6600, () => {
          card.style.opacity = '0';
        });
        wait(7100, () => {
          card.style.opacity = '';
          setState(2, 2, 4, false);
        });
        wait(9200, loop);
      })();
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  // 画布绘制动效：进入视口一次性加 .in；reduced-motion / 无 IO 直接呈现
  useEffect(() => {
    const panel = canvasRef.current;
    if (!panel) {
      return undefined;
    }
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      panel.classList.add('in');
      return undefined;
    }
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            panel.classList.add('in');
            io.disconnect();
          }
        });
      },
      {threshold: 0.35},
    );
    io.observe(panel);
    return () => io.disconnect();
  }, []);

  // 渠道两档：中英文文档的支持渠道表不同，按站渲染（zh 两行 / en 三行）
  const channelLines = isZh
    ? [
        {
          on: true,
          text: t(
            'flowtrackLp.chZh1',
            '已支持：企业微信（通讯录 · 扫码 · 部门同步）· 浏览器 / PC',
          ),
        },
        {
          on: false,
          text: t(
            'flowtrackLp.chZh2',
            '支持接入：钉钉 · 飞书 · 微信服务号 · 微信小程序 · 短信 · 邮件（关键预警兜底）',
          ),
        },
      ]
    : [
        {
          on: true,
          text: t(
            'flowtrackLp.chEn1',
            'Available now: Web browser · Email (critical-alert fallback)',
          ),
        },
        {
          on: false,
          text: t(
            'flowtrackLp.chEn2',
            'Integration supported: Microsoft Teams · Slack · Lark · Google Chat · Telegram',
          ),
        },
        {
          on: false,
          text: t('flowtrackLp.chEn3', 'Notifications: WhatsApp · LINE'),
        },
      ];

  const guideHref = '/docs/flowtrack-setup-guide';
  const overviewHref = '/docs/flowtrack';
  const ctaPrimary = t('flowtrackLp.ctaPrimary', '现在就开始');
  const cmpLabels = isZh ? ['以前', '现在'] : ['Before', 'Now'];

  const cmpRows: ReadonlyArray<readonly [string, string]> = [
    [
      t('flowtrackLp.cmp1o', '客户问进度，你去车间问一遍'),
      t('flowtrackLp.cmp1n', '首页看到每张单做到哪道'),
    ],
    [
      t('flowtrackLp.cmp2o', '交期当天才发现做不完'),
      t('flowtrackLp.cmp2n', '提前几天预警，还来得及调'),
    ],
    [
      t('flowtrackLp.cmp3o', '插一张急单，不知道影响谁'),
      t('flowtrackLp.cmp3n', '改工期立刻看出哪几张单会晚'),
    ],
    [
      t('flowtrackLp.cmp4o', '靠催、靠吼、靠记性'),
      t('flowtrackLp.cmp4n', '该谁处理，待办直接找到人'),
    ],
  ];

  const feats: ReadonlyArray<readonly [string, string]> = [
    [
      t('flowtrackLp.feat1t', '工单进度实时可见'),
      t('flowtrackLp.feat1s', '客户催单不用去车间问'),
    ],
    [
      t('flowtrackLp.feat2t', '交期自动算出来'),
      t('flowtrackLp.feat2s', '接急单不用重排工期'),
    ],
    [
      t('flowtrackLp.feat3t', '会晚的提前预警'),
      t('flowtrackLp.feat3s', '调人改计划还赶得上'),
    ],
    [
      t('flowtrackLp.feat4t', '异常直接推到责任人'),
      t('flowtrackLp.feat4s', '待办主动找人，不用挨个催、不用靠记性'),
    ],
    [
      t('flowtrackLp.feat5t', '工人扫码报工'),
      t('flowtrackLp.feat5s', '不用装软件、不用学新系统'),
    ],
    [
      t('flowtrackLp.feat6t', '手机上就能看厂'),
      t('flowtrackLp.feat6s', '不在厂里也看得见进度'),
    ],
  ];

  const faqs: ReadonlyArray<readonly [string, string]> = [
    [
      t('flowtrackLp.faq1q', '工人不会用怎么办？'),
      t('flowtrackLp.faq1a', '扫一下码就能报工，不用装软件，不用培训。'),
    ],
    [
      t('flowtrackLp.faq2q', '没有完整工艺资料能不能先跑？'),
      t('flowtrackLp.faq2a', '可以先只建一道工序，边用边补路线。'),
    ],
    [
      t('flowtrackLp.faq3q', '数据归谁、能不能导出？'),
      t('flowtrackLp.faq3a', '数据归工厂，工单与进度可导出表格。'),
    ],
    [
      t('flowtrackLp.faq4q', '和现有 ERP 什么关系？'),
      t('flowtrackLp.faq4a', '只管进度和交期，不替代 ERP 的库存与成本。'),
    ],
    [
      t('flowtrackLp.faq5q', '员工离职怎么交接？'),
      t('flowtrackLp.faq5a', '通讯录自动同步，人员变动自动跟着走。'),
    ],
    [
      t('flowtrackLp.faq6q', '工序和工期后面能改吗？'),
      t('flowtrackLp.faq6a', '能改，改完新工单按新路线算交期。'),
    ],
  ];

  return (
    <Layout
      title={t(
        'flowtrackLp.seoTitle',
        '开物智造 FlowTrack：按订单生产的中小工厂，生产进度与交期管理工具',
      )}
      description={t(
        'flowtrackLp.seoDesc',
        '每张工单做到哪道、还剩几天，首页一眼看清；会晚的提前预警，调人改计划还来得及。工艺路线画一次，交期自动算，两步报工，10 分钟设置。',
      )}
    >
      <main className={`ftlp${isZh ? '' : ' ftlp--en'}`}>
        <div className="wrap">
          {/* ===== Hero ===== */}
          <header>
            <p className="kicker">
              {t('flowtrackLp.kicker', '客户问进度，还要去车间问一遍？')}
            </p>
            <h1 className="ft-h1">
              <span>{t('flowtrackLp.h1a', '提前几天知道会晚，')}</span>
              <span>{t('flowtrackLp.h1b', '还来得及改')}</span>
            </h1>
            <p className="sub">
              {t(
                'flowtrackLp.sub',
                '每张工单做到哪道、还剩几天，首页一眼看清。会晚的提前预警到手机，调人、改计划、跟客户说一声，都还赶得上。',
              )}
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href={guideHref}>
                {ctaPrimary}
              </a>
              <a className="btn btn-ghost" href={overviewHref}>
                {t('flowtrackLp.ctaSecondary', '先看产品说明')}
              </a>
            </div>
            <p className="trust mono">
              <span>
                {t('flowtrackLp.trustA', '待办直接推给责任人 · 工人扫码报工')}
              </span>
              <span>{t('flowtrackLp.trustB', '10 分钟设置好 · 不用装软件')}</span>
            </p>

            {/* 动画舞台：一张工单的最后一程 */}
            <div className="stage" ref={stageRef}>
              <div className="stage-top">
                <div className="wocard" ref={cardRef}>
                  <div className="wo-head">
                    <span className="wo-no mono">
                      {t('flowtrackLp.cardOrder', '工单号 GD-2603-014')}
                    </span>
                    <span className="chip chip-ok" ref={chipRef}>
                      {t('flowtrackLp.chipOk', '正常')}
                    </span>
                  </div>
                  <div className="wo-name">
                    {t('flowtrackLp.cardProduct', '连接支架组件')} ·{' '}
                    {t('flowtrackLp.cardStepPre', '第')}{' '}
                    <span ref={stepRef}>3</span> / 5
                    {t('flowtrackLp.cardStepPost', ' 道')} ·{' '}
                    {t('flowtrackLp.cardNow', '当前')}{' '}
                    <span ref={curRef}>{heroNames[2]}</span>
                  </div>
                  <div className="wo-count">
                    <b>
                      <span ref={daysRef}>4</span>
                    </b>
                    <span>{t('flowtrackLp.daysUnit', '天到交期')}</span>
                  </div>
                  <div className="wo-warnrow">
                    <div className="wo-warnline">
                      {t(
                        'flowtrackLp.warnLine',
                        '预计晚 1 天 · 剩 2 天，还需 3 天',
                      )}
                    </div>
                    <div className="wo-hint">
                      {t('flowtrackLp.warnHint', '现在调人还赶得上')}
                    </div>
                    <div className="wo-actions">
                      <button className="wo-act" type="button">
                        {t('flowtrackLp.actA', '改天数 · 试算完工')}
                      </button>
                      <button className="wo-act" type="button">
                        {t('flowtrackLp.actB', '改交期')}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="stage-legend">
                  <p>
                    {t(
                      'flowtrackLp.legend',
                      '剩余天数不够做完剩余工序的那一刻，预警先出现在首页——这时候调人、改计划、跟客户改交期，都还来得及。',
                    )}
                  </p>
                </div>
              </div>

              <div className="scroller">
                <svg
      viewBox="0 0 1000 210"
                  role="img"
                  aria-label={t(
                    'flowtrackLp.heroAria',
                    '动画演示：一张工单沿工艺路线推进，剩余天数追不上剩余工序时交期预警出现',
                  )}
                >
                  <defs>
                    <marker
                      id="ftDimH"
                      viewBox="0 0 10 10"
                      refX={5}
                      refY={5}
                      markerWidth={5}
                      markerHeight={5}
                      orient="auto-start-reverse"
                    >
                      <path d="M0,2 L10,5 L0,8 z" fill="var(--line-strong)" />
                    </marker>
                  </defs>
                  {/* 基线 + 进度线 */}
                  <line
                    x1={80}
                    y1={NS_Y}
                    x2={920}
                    y2={NS_Y}
                    stroke="var(--line-strong)"
                    strokeWidth={1.5}
                  />
                  <rect
                    className="propline"
                    x={80}
                    y={117}
                    width={PROP_W}
                    height={2}
                    fill="var(--ok)"
                  />
                  {/* 节点 ×5 */}
                  {heroNames.map((name, i) => (
                    <g className="node" key={name}>
                      <circle
                        className="ring"
                        cx={NS_X[i]}
                        cy={NS_Y}
                        r={13}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                      />
                      <circle
                        className="n-base"
                        cx={NS_X[i]}
                        cy={NS_Y}
                        r={8}
                        fill="var(--panel)"
                        stroke="var(--line-strong)"
                        strokeWidth={1.6}
                      />
                      <circle
                        className="n-ok-fill"
                        cx={NS_X[i]}
                        cy={NS_Y}
                        r={8}
                        fill="var(--ok)"
                      />
                      <path
                        className="n-tick"
                        d={`M ${NS_X[i] - 3.4},${NS_Y} l 2.2,2.2 l 4.2,-4.4`}
                        stroke="#fff"
                        strokeWidth={1.7}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        className="n-cur-fill"
                        cx={NS_X[i]}
                        cy={NS_Y}
                        r={8}
                        fill="var(--accent)"
                        stroke="var(--bg)"
                        strokeWidth={2}
                      />
                      <text
                        x={NS_X[i]}
                        y={90}
                        textAnchor="middle"
                        fontSize={13}
                        fill="var(--fg)"
                        fontWeight={500}
                      >
                        {name}
                      </text>
                      <text
                        x={NS_X[i]}
                        y={144}
                        textAnchor="middle"
                        fontSize={11}
                        fill="var(--muted)"
                      >
                        {`${HERO_DAYS[i]}${dayUnit}`}
                      </text>
                    </g>
                  ))}
                  {/* 流动光点 */}
                  <g
                    className="flowdot"
                    style={{transform: `translate(${NS_X[2]}px, ${NS_Y}px)`}}
                  >
                    <circle
                      className="dot-halo"
                      r={20}
                      fill="var(--accent)"
                      opacity={0.4}
                    />
                    <circle
                      r={7}
                      fill="var(--accent)"
                      stroke="var(--bg)"
                      strokeWidth={2}
                    />
                  </g>
                  {/* 尺寸线：总工期 7 天 */}
                  <g stroke="var(--line-strong)" strokeWidth={1}>
                    <line
                      x1={80}
                      y1={168}
                      x2={920}
                      y2={168}
                      markerStart="url(#ftDimH)"
                      markerEnd="url(#ftDimH)"
                    />
                    <line x1={80} y1={162} x2={80} y2={174} />
                    <line x1={920} y1={162} x2={920} y2={174} />
                  </g>
                  <text
                    x={500}
                    y={190}
                    textAnchor="middle"
                    fontSize={12}
                    fill="var(--muted)"
                  >
                    {t(
                      'flowtrackLp.dimHero',
                      '总工期 7 天 · 启动日 + 7 天 = 交期',
                    )}
                  </text>
                  {/* 图签 */}
                  <text
                    x={996}
                    y={200}
                    textAnchor="end"
                    fontSize={9.5}
                    fill="var(--muted)"
                    opacity={0.7}
                  >
                    {t('flowtrackLp.tagHero', 'FT-LP-01 · 标准加工路线')}
                  </text>
                </svg>
              </div>
              <p className="stage-cap">
                {t(
                  'flowtrackLp.stageCap',
                  '动画 10 秒循环：报工推进 → 倒计时跳到 2 天 → 剩余工序还需 3 天 → 预警出现，当场改计划。',
                )}
              </p>
            </div>
          </header>

          {/* ===== 画布 ===== */}
          <section className="ft-sec">
            <div className="sec-head">
              <h2>
                <span>
                  {t('flowtrackLp.cvH2a', '路线画一次，以后建工单')}
                </span>
                <span>{t('flowtrackLp.cvH2b', '不用重排工期')}</span>
              </h2>
              <p>
                {t(
                  'flowtrackLp.cvSub',
                  '串行、并行、每道工期连好一次；建工单选一条路线，交期自动算出来。接急单、插单时，改一处工期就能看出哪几张单会受影响。',
                )}
              </p>
            </div>
            <div className="canvas-panel" ref={canvasRef}>
              <div className="cv-toolbar">
                <div className="cv-name">
                  <b>{t('flowtrackLp.routeName', '标准加工路线')}</b>
                  <span className="cv-total">
                    {t('flowtrackLp.cvMeta', '6 道工序 · 1 处并行')}
                  </span>
                </div>
                <div className="cv-total mono">
                  {t('flowtrackLp.cvTotalPre', '总工期')} <b>7</b>
                  {toolbarUnit} {t('flowtrackLp.cvTotalPost', '· 自动合计')}
                </div>
              </div>
              <div className="cv-body">
                <div className="scroller">
                  <svg
                    viewBox="0 0 1060 330"
                    role="img"
                    aria-label={t(
                      'flowtrackLp.cvAria',
                      '工艺路线画布：下料、机加之后焊接与热处理并行，再经组装、检验，总工期 7 天',
                    )}
                  >
                    <defs>
                      <marker
                        id="ftDimC"
                        viewBox="0 0 10 10"
                        refX={5}
                        refY={5}
                        markerWidth={5}
                        markerHeight={5}
                        orient="auto-start-reverse"
                      >
                        <path d="M0,2 L10,5 L0,8 z" fill="var(--line-strong)" />
                      </marker>
                    </defs>
                    {/* 连线：直角折线，并行支路 y=116/212 汇于 y=72 */}
                    <g stroke="var(--line-strong)" strokeWidth={1.5} fill="none">
                      <path className="cv-wire" pathLength={1} d="M 200,116 L 236,116" />
                      <path className="cv-wire" pathLength={1} d="M 376,116 L 464,116" />
                      <path className="cv-wire" pathLength={1} d="M 420,116 L 420,212 L 464,212" />
                      <path className="cv-wire" pathLength={1} d="M 604,116 L 648,116 L 648,72 L 692,72" />
                      <path className="cv-wire" pathLength={1} d="M 604,212 L 648,212 L 648,72" />
                      <path className="cv-wire" pathLength={1} d="M 832,72 L 876,72 L 876,116 L 900,116" />
                    </g>
                    <g fill="var(--line-strong)">
                      {CV_JUNCTIONS.map(([cx, cy]) => (
                        <circle key={`${cx}-${cy}`} className="cv-node" cx={cx} cy={cy} r={3} />
                      ))}
                    </g>
                    {/* 节点 */}
                    {CV_NODES.map(([x, y, key, zhName, d]) => {
                      const name = t(`flowtrackLp.${key}`, zhName);
                      return (
                        <g className="cv-node" key={key}>
                          <rect
                            x={x}
                            y={y - 24}
                            width={140}
                            height={48}
                            rx={7}
                            fill="var(--panel-2)"
                            stroke="var(--line-strong)"
                            strokeWidth={1.4}
                          />
                          <text
                            x={x + 14}
                            y={y + 5}
                            fontSize={13.5}
                            fill="var(--fg)"
                            fontWeight={500}
                          >
                            {name}
                          </text>
                          <text
                            className="cv-day"
                            x={x + 14}
                            y={y - 32}
                            fontSize={10.5}
                            fill="var(--muted)"
                          >
                            {`${d}${dayUnit}`}
                          </text>
                        </g>
                      );
                    })}
                    {/* 尺寸线 */}
                    <g className="cv-dim">
                      <g stroke="var(--line-strong)" strokeWidth={1}>
                        <line
                          x1={60}
                          y1={286}
                          x2={1040}
                          y2={286}
                          markerStart="url(#ftDimC)"
                          markerEnd="url(#ftDimC)"
                        />
                        <line x1={60} y1={280} x2={60} y2={292} />
                        <line x1={1040} y1={280} x2={1040} y2={292} />
                      </g>
                      <text
                        x={550}
                        y={316}
                        textAnchor="middle"
                        fontSize={12}
                        fill="var(--muted)"
                      >
                        {t(
                          'flowtrackLp.cvDim',
                          '总工期 7 天：1 + 2 + 并行取最长（1 天）+ 2 + 1',
                        )}
                      </text>
                    </g>
                    {/* 图签 */}
                    <text
                      className="cv-tag"
                      x={1056}
                      y={26}
                      textAnchor="end"
                      fontSize={9.5}
                      fill="var(--muted)"
                      opacity={0.7}
                    >
                      {t('flowtrackLp.cvTag', 'FT-LP-02 · 路线画布（重建）')}
                    </text>
                  </svg>
                </div>
              </div>
            </div>
            <p className="canvas-cap">
              {t(
                'flowtrackLp.cvCap',
                '并行支路取最长路径计总工期，连成环当场拒绝；建工单选这条路线，交期自动带出。',
              )}
            </p>
          </section>

          {/* ===== 功能条 ===== */}
          <section className="ft-sec">
            <div className="sec-head">
              <h2>
                {t('flowtrackLp.featsH2', '车间里的事，手机上就能盯住')}
              </h2>
            </div>
            <div className="feats">
              {feats.map(([title, sub]) => (
                <div className="feat" key={title}>
                  <b>{title}</b>
                  <span>{sub}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ===== 以前 / 现在 ===== */}
          <section className="ft-sec">
            <div className="sec-head">
              <h2>
                {t('flowtrackLp.cmpH2', '换掉的不只是表格，是催人的方式')}
              </h2>
            </div>
            <div className="cmp">
              <div className="cmp-head">
                <span>{cmpLabels[0]}</span>
                <span>{cmpLabels[1]}</span>
              </div>
              {cmpRows.map(([o, n]) => (
                <div className="cmp-row" key={o}>
                  <span>{o}</span>
                  <span>{n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ===== 成本条 / 渠道 / 边界句 ===== */}
          <section className="ft-sec">
            <div className="costbar mono">
              <span>
                <b>10</b>
                {t('flowtrackLp.costSetup', ' 分钟设置')}
              </span>
              <span>{t('flowtrackLp.costRoute', '画一次工艺路线就能跑')}</span>
              <span>
                {t('flowtrackLp.costPhone', '手机上直接用，不用装软件')}
              </span>
            </div>
            <div className="channels mono">
              {channelLines.map((c) => (
                <p key={c.text}>
                  <i className={`dot${c.on ? ' dot-on' : ''}`} />
                  {c.text}
                </p>
              ))}
            </div>
            <p className="boundary">
              {t(
                'flowtrackLp.boundary',
                '只管进度和交期。库存、成本、工资、审批留给 ERP 和财务；进度按工序走，不按件数追。',
              )}
            </p>
          </section>

          {/* ===== FAQ ===== */}
          <section className="ft-sec">
            <div className="sec-head">
              <h2>
                {t('flowtrackLp.faqH2', '开工前，厂长最常问的六件事')}
              </h2>
            </div>
            <div className="faq">
              {faqs.map(([q, a]) => (
                <div className="qa" key={q}>
                  <b>{q}</b>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ===== 二次 CTA ===== */}
          <section className="ft-sec final-cta">
            <h2>{t('flowtrackLp.cta2H2', '先拿一张真实工单试一遍')}</h2>
            <p>{t('flowtrackLp.cta2Sub', '10 分钟设置好，不用装软件，数据可导出。')}</p>
            <a className="btn btn-primary" href={guideHref}>
              {ctaPrimary}
            </a>
          </section>
        </div>
      </main>
    </Layout>
  );
}
