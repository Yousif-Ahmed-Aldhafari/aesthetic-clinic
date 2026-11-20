import React, { useState } from 'react';
import type {
  OswestryScoreResult,
  QuickDashScoreResult,
  LysholmKneeScoreResult,
} from './types';
import {
  calculateOdiScore,
  calculateQuickDashScore,
  calculateLysholmScore,
} from './orthopedics-physiotherapy-analytics';

export const FunctionalScalesSection: React.FC = () => {
  const [activeScale, setActiveScale] = useState<'ODI' | 'QUICKDASH' | 'LYSHOLM'>('ODI');

  // =========================================================================
  // 1. OSWESTRY DISABILITY INDEX (ODI 2.0)
  // Licensing Gate: Copyright © Jeremy Fairbank / Mapi Research Trust (ePROVIDE).
  // Verbatim questionnaire items are disabled in software distribution pending
  // institutional commercial licensing. Clinicians enter validated section scores.
  // =========================================================================
  const ODI_SECTIONS_META = [
    { id: 1, nameAr: 'القسم 1: شدة الألم', nameEn: 'Section 1: Pain Intensity' },
    { id: 2, nameAr: 'القسم 2: العناية الشخصية', nameEn: 'Section 2: Personal Care' },
    { id: 3, nameAr: 'القسم 3: رفع الأثقال', nameEn: 'Section 3: Lifting' },
    { id: 4, nameAr: 'القسم 4: المشي', nameEn: 'Section 4: Walking' },
    { id: 5, nameAr: 'القسم 5: الجلوس', nameEn: 'Section 5: Sitting' },
    { id: 6, nameAr: 'القسم 6: الوقوف', nameEn: 'Section 6: Standing' },
    { id: 7, nameAr: 'القسم 7: النوم', nameEn: 'Section 7: Sleeping' },
    { id: 8, nameAr: 'القسم 8: الحياة الاجتماعية', nameEn: 'Section 8: Social Life' },
    { id: 9, nameAr: 'القسم 9: السفر والتنقل', nameEn: 'Section 9: Traveling' },
    { id: 10, nameAr: 'القسم 10: الأنشطة المنزلية والمهنية', nameEn: 'Section 10: Employment / Homemaking' },
  ];

  const [odiScores, setOdiScores] = useState<Record<number, number | null>>({
    1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2,
  });

  const odiArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => odiScores[id] ?? null);
  const rawOdiCalc = calculateOdiScore(odiArray);
  const odiResult: OswestryScoreResult | null = rawOdiCalc
    ? {
        score: rawOdiCalc.percentageScore,
        answeredSectionsCount: rawOdiCalc.answeredSectionsCount,
        totalSections: 10,
        disabilityCategory: rawOdiCalc.severityCategory,
        descriptionAr: rawOdiCalc.descriptionAr,
        descriptionEn: rawOdiCalc.descriptionEn,
      }
    : null;

  // =========================================================================
  // 2. QUICKDASH (DISABILITIES OF THE ARM, SHOULDER AND HAND)
  // Licensing Gate: Copyright © 2003 Institute for Work & Health (IWH) / AAOS.
  // Commercial EHR embedding requires institutional licensing agreement from IWH.
  // =========================================================================
  const QUICKDASH_ITEMS_META = [
    { id: 1, nameAr: 'البند 1 (Item 1)', nameEn: 'Item 1' },
    { id: 2, nameAr: 'البند 2 (Item 2)', nameEn: 'Item 2' },
    { id: 3, nameAr: 'البند 3 (Item 3)', nameEn: 'Item 3' },
    { id: 4, nameAr: 'البند 4 (Item 4)', nameEn: 'Item 4' },
    { id: 5, nameAr: 'البند 5 (Item 5)', nameEn: 'Item 5' },
    { id: 6, nameAr: 'البند 6 (Item 6)', nameEn: 'Item 6' },
    { id: 7, nameAr: 'البند 7 (Item 7)', nameEn: 'Item 7' },
    { id: 8, nameAr: 'البند 8 (Item 8)', nameEn: 'Item 8' },
    { id: 9, nameAr: 'البند 9 (Item 9)', nameEn: 'Item 9' },
    { id: 10, nameAr: 'البند 10 (Item 10)', nameEn: 'Item 10' },
    { id: 11, nameAr: 'البند 11 (Item 11)', nameEn: 'Item 11' },
  ];

  const [dashScores, setDashScores] = useState<Record<number, number | null>>({
    1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2,
  });

  const dashArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) => dashScores[id] ?? null);
  const rawDashCalc = calculateQuickDashScore(dashArray);
  const quickDashResult: QuickDashScoreResult | null = rawDashCalc
    ? {
        score: rawDashCalc.score,
        answeredCount: rawDashCalc.answeredCount,
        descriptionAr: rawDashCalc.descriptionAr,
        descriptionEn: rawDashCalc.descriptionEn,
      }
    : null;

  // =========================================================================
  // 3. LYSHOLM KNEE SCORING SCALE
  // Licensing Gate: Published by Lysholm & Gillquist (1982) / Tegner & Lysholm (1985).
  // Clinicians score domain findings directly according to licensed clinical practice.
  // =========================================================================
  const [lysholmItems, setLysholmItems] = useState({
    limp: 5,
    support: 5,
    locking: 15,
    instability: 25,
    pain: 25,
    swelling: 10,
    stairClimbing: 10,
    squatting: 5,
  });

  const rawLysholmCalc = calculateLysholmScore(lysholmItems);
  const lysholmResult: LysholmKneeScoreResult = rawLysholmCalc ?? {
    totalScore: 0,
    ratingCategory: 'POOR',
    descriptionAr: 'بيانات غير مكتملة',
    descriptionEn: 'Incomplete data',
  };

  return (
    <div className="functional-scales-section space-y-6" dir="rtl">
      {/* Tab Switcher */}
      <div className="flex border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => setActiveScale('ODI')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeScale === 'ODI'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          مؤشر أوزويستري للعمود الفقري (ODI 2.0)
        </button>
        <button
          type="button"
          onClick={() => setActiveScale('QUICKDASH')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeScale === 'QUICKDASH'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          مقياس إعاقة الطرف العلوي (QuickDASH)
        </button>
        <button
          type="button"
          onClick={() => setActiveScale('LYSHOLM')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeScale === 'LYSHOLM'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          مقياس وظيفة الركبة (Lysholm Knee Scale)
        </button>
      </div>

      {/* ODI 2.0 VIEW */}
      {activeScale === 'ODI' && (
        <div className="space-y-4">
          {/* IP / Licensing Boundary Alert */}
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-1.5 text-amber-950">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <span>⚠️</span>
              <span>بوابة تراخيص الاستبيانات السريرية المعتمدة (Clinical Instrument Licensing Notice):</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900">
              استبيان مؤشر أوزويستري للعجز الوظيفي للعمود الفقري (Oswestry Disability Index - ODI 2.0) محمي بحقوق الملكية الفكرية لصالح (Jeremy Fairbank / Mapi Research Trust / ePROVIDE). إن تضمين النص الحرفي لأسئلة الاستبيان أو خياراته داخل الأنظمة التجارية يستلزم اتفاقية ترخيص مؤسسي مع الجهة المالكة لحقوق التوزيع.
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800 font-semibold">
              حالة التوزيع في النظام: تم حجب النصوص الحرفية للأسئلة تلقائياً احتراماً لحقوق الملكية الفكرية، مع الإبقاء على المحرك الحسابي المعتمد لتمكين الطبيب المرخص من إدخال درجات الأقسام (0–5) مباشرة لحساب النسبة المئوية وتصنيف العجز السريري.
            </p>
          </div>

          {/* Section Score Input Grid */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h4 className="font-bold text-gray-900 text-sm">
              إدخال درجات أقسام مؤشر أوزويستري للعمود الفقري (ODI 2.0 Section Scores)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {ODI_SECTIONS_META.map((sec) => (
                <div key={sec.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-800 block">{sec.nameAr}</span>
                    <span className="text-[10px] text-gray-500 block">{sec.nameEn}</span>
                  </div>
                  <select
                    value={odiScores[sec.id] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      setOdiScores({ ...odiScores, [sec.id]: val });
                    }}
                    className="p-1.5 border border-gray-300 rounded bg-white text-xs font-bold text-blue-900"
                  >
                    <option value="">غير مجاب (متروك)</option>
                    <option value="0">0 — لا عجز</option>
                    <option value="1">1 — خفيف</option>
                    <option value="2">2 — معتدل</option>
                    <option value="3">3 — متوسط إلى شديد</option>
                    <option value="4">4 — شديد جداً</option>
                    <option value="5">5 — أقصى عجز ممكن</option>
                  </select>
                </div>
              ))}
            </div>

            {/* Result Display */}
            {odiResult ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-blue-950 text-sm">النتيجة المحسوبة لمؤشر أوزويستري:</span>
                  <span className="text-base font-black text-blue-800">{odiResult.score}%</span>
                </div>
                <div className="text-xs text-blue-900 font-semibold">{odiResult.descriptionAr}</div>
                <div className="text-[11px] text-gray-500 font-mono">
                  الأقسام المجابة: {odiResult.answeredSectionsCount} من 10 (الحد الأدنى للاحتساب: 8 أقسام)
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-100 text-gray-600 rounded text-xs text-center">
                يلزم الإجابة على 8 أقسام على الأقل لاحتساب مؤشر أوزويستري بدقة وموثوقية سريرية.
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUICKDASH VIEW */}
      {activeScale === 'QUICKDASH' && (
        <div className="space-y-4">
          {/* IP / Licensing Boundary Alert */}
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-1.5 text-amber-950">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <span>⚠️</span>
              <span>بوابة تراخيص مقياس إعاقة الطرف العلوي (QuickDASH Licensing Boundary):</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900">
              مقياس إعاقة الذراع والكتف واليد (QuickDASH) محمي بحقوق الملكية الفكرية لصالح (Institute for Work & Health - IWH & AAOS, 2003). إن الاستخدام التجاري أو تضمين بنود الاستبيان في برمجيات السجلات الصحية يتطلب ترخيصاً رسمياً مسبقاً من IWH.
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800 font-semibold">
              حالة التوزيع في النظام: تم حجب نصوص البنود الحرفية حمايةً لحقوق الملكية الفكرية، مع توفير واجهة الإدخال المباشر لدرجات البنود (1–5) واحتساب الدرجة المعيارية وفق المعادلة الرسمية المعتمدة لـ QuickDASH.
            </p>
          </div>

          {/* QuickDASH Score Input Grid */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h4 className="font-bold text-gray-900 text-sm">
              إدخال درجات بنود مقياس QuickDASH (درجات من 1 إلى 5)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {QUICKDASH_ITEMS_META.map((item) => (
                <div key={item.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                  <span className="font-bold text-gray-800">{item.nameAr}</span>
                  <select
                    value={dashScores[item.id] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      setDashScores({ ...dashScores, [item.id]: val });
                    }}
                    className="p-1.5 border border-gray-300 rounded bg-white text-xs font-bold text-blue-900"
                  >
                    <option value="">متروك</option>
                    <option value="1">1 — لا توجد صعوبة</option>
                    <option value="2">2 — صعوبة خفيفة</option>
                    <option value="3">3 — صعوبة متوسطة</option>
                    <option value="4">4 — صعوبة شديدة</option>
                    <option value="5">5 — غير قادر إطلاقاً</option>
                  </select>
                </div>
              ))}
            </div>

            {/* QuickDASH Result */}
            {quickDashResult ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-blue-950 text-sm">درجة إعاقة الطرف العلوي (QuickDASH Score):</span>
                  <span className="text-base font-black text-blue-800">{quickDashResult.score} / 100</span>
                </div>
                <div className="text-xs text-blue-900 font-semibold">{quickDashResult.descriptionAr}</div>
                <div className="text-[11px] text-gray-500 font-mono">
                  البنود المجابة: {quickDashResult.answeredCount} من 11 (الحد الأدنى للاحتساب: 10 بنود)
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-100 text-gray-600 rounded text-xs text-center">
                يلزم الإجابة على 10 بنود على الأقل لاحتساب درجة QuickDASH وفق الإرشادات الرسمية.
              </div>
            )}
          </div>
        </div>
      )}

      {/* LYSHOLM VIEW */}
      {activeScale === 'LYSHOLM' && (
        <div className="space-y-4">
          {/* Licensing Information */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <span className="font-bold block">مقياس وظيفة الركبة (Lysholm Knee Scoring Scale - 1982 / 1985):</span>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              مقياس ليزهولم سريري معتمد لتقييم أعراض وثبات مفصل الركبة وإصابات الأربطة والغضاريف الهلالية بإجمالي 100 نقطة موزعة عبر 8 محاور سريرية.
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4 text-xs">
            <h4 className="font-bold text-gray-900 text-sm">محاور تقييم وظيفة الركبة (Lysholm Domains):</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-gray-700 block mb-1">العرج (Limp - max 5):</label>
                <select
                  value={lysholmItems.limp}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, limp: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="5">5 — لا يوجد عرج (None)</option>
                  <option value="3">3 — عرج خفيف أو متقطع (Slight/Periodical)</option>
                  <option value="0">0 — عرج مستمر وشديد (Severe/Constant)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">الدعامة / العكازات (Support - max 5):</label>
                <select
                  value={lysholmItems.support}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, support: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="5">5 — لا يحتاج دعامة (None)</option>
                  <option value="2">2 — عكاز أو عصا واحدة (Cane or crutch)</option>
                  <option value="0">0 — عكازان أو عدم إمكانية التحميل (Weight-bearing impossible)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">انقفال المفصل (Locking - max 15):</label>
                <select
                  value={lysholmItems.locking}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, locking: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="15">15 — لا يوجد انقفال أو إحساس بالتعليق (No locking)</option>
                  <option value="10">10 — إحساس بالتعليق دون انقفال حقيقي (Catching sensation)</option>
                  <option value="6">6 — انقفال متكرر أحياناً (Frequently locked)</option>
                  <option value="2">2 — انقفال متكرر ومتكرر جداً (Frequently locked in exam)</option>
                  <option value="0">0 — مفصل منقفل في الوقت الراهن (Locked joint)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">عدم الاستقرار / الإفلات (Instability - max 25):</label>
                <select
                  value={lysholmItems.instability}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, instability: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="25">25 — لا يوجد إفلات أبداً (Never gives way)</option>
                  <option value="20">20 — نادراً أثناء الرياضة المجهدة (Rarely during athletics)</option>
                  <option value="15">15 — متكرر أثناء الرياضة (Frequently during athletics)</option>
                  <option value="10">10 — أحياناً في الأنشطة اليومية (Occasionally in daily life)</option>
                  <option value="5">5 — متكرر في الأنشطة اليومية (Frequently in daily life)</option>
                  <option value="0">0 — مع كل خطوة (Every step)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">الألم (Pain - max 25):</label>
                <select
                  value={lysholmItems.pain}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, pain: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="25">25 — لا يوجد ألم (None)</option>
                  <option value="20">20 — ألم خفيف وغير متكرر أثناء النشاط المجهد (Inconstant/Slight)</option>
                  <option value="15">15 — ألم ملحوظ أثناء النشاط المجهد (Marked during heavy exertion)</option>
                  <option value="10">10 — ألم ملحوظ أثناء المشي لأكثر من 2 كم (Marked after walking &gt; 2km)</option>
                  <option value="5">5 — ألم ملحوظ أثناء المشي لأقل من 2 كم (Marked after walking &lt; 2km)</option>
                  <option value="0">0 — ألم مستمر ومقعد (Constant and severe)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">التورم (Swelling - max 10):</label>
                <select
                  value={lysholmItems.swelling}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, swelling: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="10">10 — لا يوجد تورم (None)</option>
                  <option value="6">6 — تورم أثناء النشاط المجهد فقط (On heavy exertion)</option>
                  <option value="2">2 — تورم في الأنشطة اليومية المعتادة (On ordinary exertion)</option>
                  <option value="0">0 — تورم مستمر ودائم (Constant)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">صعود الدرج (Stair Climbing - max 10):</label>
                <select
                  value={lysholmItems.stairClimbing}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, stairClimbing: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="10">10 — لا توجد صعوبة (No problems)</option>
                  <option value="6">6 — بطء بسيط مع بعض الحذر (Slightly impaired)</option>
                  <option value="2">2 — خطوة واحدة في كل مرة (One step at a time)</option>
                  <option value="0">0 — عدم إمكانية صعود الدرج (Impossible)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">وضعية القرفصاء (Squatting - max 5):</label>
                <select
                  value={lysholmItems.squatting}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, squatting: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value="5">5 — لا توجد صعوبة (No problems)</option>
                  <option value="4">4 — صعوبة خفيفة (Slightly impaired)</option>
                  <option value="2">2 — لا يتجاوز 90 درجة ثني (Not beyond 90 degrees)</option>
                  <option value="0">0 — عدم إمكانية القرفصاء (Impossible)</option>
                </select>
              </div>
            </div>

            {/* Lysholm Result */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 mt-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-blue-950 text-sm">مجموع درجة ليزهولم للركبة (Lysholm Score):</span>
                <span className="text-base font-black text-blue-800">{lysholmResult.totalScore} / 100</span>
              </div>
              <div className="text-xs text-blue-900 font-semibold">{lysholmResult.descriptionAr}</div>
              <div className="text-[11px] text-gray-500 font-mono">
                التصنيف السريري: {lysholmResult.ratingCategory} (ممتاز: 95–100 | جيد: 84–94 | متوسط: 65–83 | ضعيف: &lt;65)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
