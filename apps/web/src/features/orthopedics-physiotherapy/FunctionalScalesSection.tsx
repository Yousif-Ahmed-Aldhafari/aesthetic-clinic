import React, { useState } from 'react';
import type {
  OswestryScoreResult,
  QuickDashScoreResult,
  LysholmKneeScoreResult,
} from './types';

export const FunctionalScalesSection: React.FC = () => {
  const [activeScale, setActiveScale] = useState<'ODI' | 'QUICKDASH' | 'LYSHOLM'>('ODI');

  // =========================================================================
  // OSWESTRY DISABILITY INDEX (ODI 2.0)
  // =========================================================================
  const ODI_SECTIONS = [
    {
      id: 1,
      titleAr: '1. شدة الألم (Pain Intensity)',
      options: [
        { score: 0, text: 'لا أشعر بأي ألم في الوقت الحالي.' },
        { score: 1, text: 'الألم خفيف جداً في الوقت الحالي.' },
        { score: 2, text: 'الألم معتدل في الوقت الحالي.' },
        { score: 3, text: 'الألم شديد إلى حد ما في الوقت الحالي.' },
        { score: 4, text: 'الألم شديد جداً في الوقت الحالي.' },
        { score: 5, text: 'الألم أسوأ ما يمكن تخيله.' },
      ],
    },
    {
      id: 2,
      titleAr: '2. العناية الشخصية (Personal Care)',
      options: [
        { score: 0, text: 'أستطيع العناية بنفسي بشكل طبيعي دون التسبب بألم إضافي.' },
        { score: 1, text: 'أستطيع العناية بنفسي بشكل طبيعي ولكن ذلك يسبب ألماً خفيفاً.' },
        { score: 2, text: 'العناية بنفسي مؤلمة وأحتاج إلى أن أكون بطيئاً وحذراً.' },
        { score: 3, text: 'أحتاج إلى بعض المساعدة ولكنني أتدبر معظم أموري بنفسي.' },
        { score: 4, text: 'أحتاج إلى مساعدة يومية في معظم جوانب العناية الشخصية.' },
        { score: 5, text: 'لا أستطيع ارتداء ملابسي وأغسل نفسي بصعوبة وأبقى في السرير.' },
      ],
    },
    {
      id: 3,
      titleAr: '3. رفع الأشياء (Lifting)',
      options: [
        { score: 0, text: 'أستطيع رفع الأوزان الثقيلة دون ألم إضافي.' },
        { score: 1, text: 'أستطيع رفع الأوزان الثقيلة ولكن يسبب ذلك ألماً إضافياً.' },
        { score: 2, text: 'يمنعني الألم من رفع الأوزان الثقيلة عن الأرض، لكن يمكنني إذا كانت على طاولة.' },
        { score: 3, text: 'يمنعني الألم من رفع الأوزان الثقيلة، ولكن يمكنني رفع الأوزان الخفيفة إلى المتوسطة.' },
        { score: 4, text: 'لا يمكنني رفع سوى الأشياء الخفيفة جداً.' },
        { score: 5, text: 'لا يمكنني رفع أو حمل أي شيء على الإطلاق.' },
      ],
    },
    {
      id: 4,
      titleAr: '4. المشي (Walking)',
      options: [
        { score: 0, text: 'الألم لا يمنعني من المشي لأي مسافة.' },
        { score: 1, text: 'الألم يمنعني من المشي لمسافة تزيد عن كيلومتر واحد.' },
        { score: 2, text: 'الألم يمنعني من المشي لمسافة تزيد عن 500 متر.' },
        { score: 3, text: 'الألم يمنعني من المشي لمسافة تزيد عن 100 متر.' },
        { score: 4, text: 'لا يمكنني المشي إلا باستخدام عصا أو عكازات.' },
        { score: 5, text: 'أنا طريح الفراش في معظم الوقت وأزحف إلى المرحاض بصعوبة.' },
      ],
    },
    {
      id: 5,
      titleAr: '5. الجلوس (Sitting)',
      options: [
        { score: 0, text: 'أستطيع الجلوس على أي كرسي طالما أردت.' },
        { score: 1, text: 'أستطيع الجلوس على كرسيي المفضل طالما أردت.' },
        { score: 2, text: 'الألم يمنعني من الجلوس لأكثر من ساعة واحدة.' },
        { score: 3, text: 'الألم يمنعني من الجلوس لأكثر من 30 دقيقة.' },
        { score: 4, text: 'الألم يمنعني من الجلوس لأكثر من 10 دقائق.' },
        { score: 5, text: 'الألم يمنعني من الجلوس على الإطلاق.' },
      ],
    },
    {
      id: 6,
      titleAr: '6. الوقوف (Standing)',
      options: [
        { score: 0, text: 'أستطيع الوقوف طالما أردت دون ألم إضافي.' },
        { score: 1, text: 'أستطيع الوقوف طالما أردت ولكن ذلك يسبب لي بعض الألم.' },
        { score: 2, text: 'الألم يمنعني من الوقوف لأكثر من ساعة واحدة.' },
        { score: 3, text: 'الألم يمنعني من الوقوف لأكثر من 30 دقيقة.' },
        { score: 4, text: 'الألم يمنعني من الوقوف لأكثر من 10 دقائق.' },
        { score: 5, text: 'الألم يمنعني من الوقوف على الإطلاق.' },
      ],
    },
    {
      id: 7,
      titleAr: '7. النوم (Sleeping)',
      options: [
        { score: 0, text: 'نومي لا يتعكر أبداً بالألم.' },
        { score: 1, text: 'نومي يتعكر أحياناً بالألم.' },
        { score: 2, text: 'بسبب الألم لا أنام أكثر من 6 ساعات.' },
        { score: 3, text: 'بسبب الألم لا أنام أكثر من 4 ساعات.' },
        { score: 4, text: 'بسبب الألم لا أنام أكثر من ساعتين.' },
        { score: 5, text: 'الألم يمنعني من النوم على الإطلاق.' },
      ],
    },
    {
      id: 8,
      titleAr: '8. الحياة الاجتماعية (Social Life)',
      options: [
        { score: 0, text: 'حياتي الاجتماعية طبيعية ولا تسبب لي ألماً إضافياً.' },
        { score: 1, text: 'حياتي الاجتماعية طبيعية ولكنها تزيد من درجة الألم.' },
        { score: 2, text: 'الألم ليس له تأثير ملحوظ على حياتي الاجتماعية باستثناء الأنشطة المجهدة كالرياضة.' },
        { score: 3, text: 'الألم قيّد حياتي الاجتماعية ولا أخرج كثيراً.' },
        { score: 4, text: 'الألم قيّد حياتي الاجتماعية في منزلي فقط.' },
        { score: 5, text: 'ليس لدي أي حياة اجتماعية بسبب الألم.' },
      ],
    },
    {
      id: 9,
      titleAr: '9. السفر والتنقل (Traveling)',
      options: [
        { score: 0, text: 'أستطيع السفر إلى أي مكان دون ألم.' },
        { score: 1, text: 'أستطيع السفر إلى أي مكان ولكن ذلك يسبب لي بعض الألم.' },
        { score: 2, text: 'الألم سيء ولكن يمكنني تدبر رحلات تزيد عن ساعتين.' },
        { score: 3, text: 'الألم يقيدني برحلات تقل عن ساعة واحدة.' },
        { score: 4, text: 'الألم يقيدني بالرحلات الضرورية فقط التي تقل عن 30 دقيقة.' },
        { score: 5, text: 'الألم يمنعني من السفر إلا لتلقي العلاج في المستشفى.' },
      ],
    },
    {
      id: 10,
      titleAr: '10. الوظيفة / الأعمال المنزلية (Employment / Homemaking)',
      options: [
        { score: 0, text: 'أنشطتي اليومية وأعمالي معتادة ولا تسبب أي ألم.' },
        { score: 1, text: 'أستطيع القيام بجميع واجباتي المعتادة مع بعض الألم.' },
        { score: 2, text: 'أستطيع القيام بمعظم واجباتي المعتادة ولكن بوتيرة أبطأ بسبب الألم.' },
        { score: 3, text: 'لا أستطيع إنجاز سوى نصف مهامي المعتادة.' },
        { score: 4, text: 'لا أستطيع إنجاز سوى الربع من واجباتي المعتادة.' },
        { score: 5, text: 'الألم يمنعني تماماً من القيام بأي عمل منزلي أو وظيفي.' },
      ],
    },
  ];

  const [odiAnswers, setOdiAnswers] = useState<Record<number, number>>({});

  const computeOdi = (): OswestryScoreResult | null => {
    const answeredKeys = Object.keys(odiAnswers).map(Number);
    if (answeredKeys.length < 8) return null;

    let sum = 0;
    for (const key of answeredKeys) {
      sum += odiAnswers[key] || 0;
    }
    const maxScore = answeredKeys.length * 5;
    const score = Math.round((sum / maxScore) * 100 * 10) / 10;

    let disabilityCategory: OswestryScoreResult['disabilityCategory'];
    let descriptionAr: string;
    let descriptionEn: string;

    if (score <= 20) {
      disabilityCategory = 'MINIMAL';
      descriptionAr = `عجز طفيف (${score}%) — المريض قادر على التعامل مع معظم الأنشطة اليومية.`;
      descriptionEn = `Minimal disability (${score}%) — patient copes with most daily living activities.`;
    } else if (score <= 40) {
      disabilityCategory = 'MODERATE';
      descriptionAr = `عجز معتدل (${score}%) — يعاني المريض من ألم وصعوبة عند الجلوس والرفع والوقوف.`;
      descriptionEn = `Moderate disability (${score}%) — pain and difficulty with sitting, lifting and standing.`;
    } else if (score <= 60) {
      disabilityCategory = 'SEVERE';
      descriptionAr = `عجز شديد (${score}%) — الألم يعيق الأنشطة اليومية؛ الفحص والاستقصاءات ضرورية.`;
      descriptionEn = `Severe disability (${score}%) — pain impinges on all aspects of daily living.`;
    } else if (score <= 80) {
      disabilityCategory = 'CRIPPLED';
      descriptionAr = `عجز مقعد (${score}%) — آلام الظهر تؤثر على جميع مجالات حياة المريض؛ تدخل نشط مطلوب.`;
      descriptionEn = `Crippled (${score}%) — back pain impinges on all areas of life; active intervention required.`;
    } else {
      disabilityCategory = 'BED_BOUND_OR_EXAGGERATING';
      descriptionAr = `طريح الفراش أو تضخيم للأعراض (${score}%) — مريض مقعد في السرير أو يحتاج لتقييم دقيق للأعراض.`;
      descriptionEn = `Bed-bound or symptom exaggeration (${score}%).`;
    }

    return {
      score,
      answeredSectionsCount: answeredKeys.length,
      totalSections: 10,
      disabilityCategory,
      descriptionAr,
      descriptionEn,
    };
  };

  const odiResult = computeOdi();

  // =========================================================================
  // QUICKDASH (DISABILITIES OF THE ARM, SHOULDER AND HAND)
  // =========================================================================
  const QUICKDASH_ITEMS = [
    '1. فتح مرطبان محكم الإغلاق أو جديد.',
    '2. القيام بأعمال منزلية شاقة (مثل غسيل الجدران أو تنظيف الأرضيات).',
    '3. حمل كيس تسوق أو حقيبة سفر ممتلئة.',
    '4. غسل ظهرك بالماء والصابون.',
    '5. استخدام السكين لتقطيع الطعام.',
    '6. الأنشطة الترفيهية التي تتطلب بعض القوة أو الضغط عبر ذراعك أو كتفك أو يدك (مثل لعب الغولف أو التنس).',
    '7. إلى أي مدى تداخلت مشكلة ذراعك أو كتفك أو يدك مع أنشطتك الاجتماعية العادية؟',
    '8. هل كنت محدوداً في عملك أو أنشطتك اليومية الأخرى نتيجة لمشكلة ذراعك أو كتفك أو يدك؟',
    '9. ألم الذراع أو الكتف أو اليد أثناء أي نشاط.',
    '10. وخز أو تنميل (خدر) في ذراعك أو كتفك أو يدك.',
    '11. صعوبة في النوم بسبب الألم في ذراعك أو كتفك أو يدك.',
  ];

  const [dashAnswers, setDashAnswers] = useState<Record<number, number>>({});

  const computeQuickDash = (): QuickDashScoreResult | null => {
    const keys = Object.keys(dashAnswers).map(Number);
    if (keys.length < 10) return null;

    let sum = 0;
    for (const k of keys) {
      sum += dashAnswers[k];
    }
    const score = Math.round((((sum / keys.length) - 1) * 25) * 10) / 10;

    let descriptionAr: string;
    let descriptionEn: string;

    if (score <= 20) {
      descriptionAr = `عجز وظيفي خفيف جداً في الطرف العلوي (${score}/100)`;
      descriptionEn = `Minimal upper limb disability (${score}/100)`;
    } else if (score <= 40) {
      descriptionAr = `عجز وظيفي معتدل في الطرف العلوي (${score}/100)`;
      descriptionEn = `Moderate upper limb disability (${score}/100)`;
    } else if (score <= 60) {
      descriptionAr = `عجز وظيفي ملحوظ في الطرف العلوي (${score}/100)`;
      descriptionEn = `Substantial upper limb disability (${score}/100)`;
    } else {
      descriptionAr = `عجز وظيفي شديد في الطرف العلوي (${score}/100)`;
      descriptionEn = `Severe upper limb disability (${score}/100)`;
    }

    return {
      score,
      answeredCount: keys.length,
      descriptionAr,
      descriptionEn,
    };
  };

  const quickDashResult = computeQuickDash();

  // =========================================================================
  // LYSHOLM KNEE SCORING SCALE
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

  const computeLysholm = (): LysholmKneeScoreResult => {
    const totalScore =
      lysholmItems.limp +
      lysholmItems.support +
      lysholmItems.locking +
      lysholmItems.instability +
      lysholmItems.pain +
      lysholmItems.swelling +
      lysholmItems.stairClimbing +
      lysholmItems.squatting;

    let ratingCategory: LysholmKneeScoreResult['ratingCategory'];
    let descriptionAr: string;
    let descriptionEn: string;

    if (totalScore >= 95) {
      ratingCategory = 'EXCELLENT';
      descriptionAr = `أداء ركبة ممتاز (درجة ليزهولم: ${totalScore}/100) — بدون أعراض محددة للنشاط`;
      descriptionEn = `Excellent knee function (${totalScore}/100)`;
    } else if (totalScore >= 84) {
      ratingCategory = 'GOOD';
      descriptionAr = `أداء ركبة جيد (درجة ليزهولم: ${totalScore}/100) — قيود خفيفة في الأنشطة المجهدة`;
      descriptionEn = `Good knee function (${totalScore}/100)`;
    } else if (totalScore >= 65) {
      ratingCategory = 'FAIR';
      descriptionAr = `أداء ركبة مقبول / متوسط (درجة ليزهولم: ${totalScore}/100) — ألم أو عدم استقرار معتدل`;
      descriptionEn = `Fair knee function (${totalScore}/100)`;
    } else {
      ratingCategory = 'POOR';
      descriptionAr = `أداء ركبة ضعيف (درجة ليزهولم: ${totalScore}/100) — عجز وظيفي شديد يستدعي تدخلاً جراحياً أو تأهيلياً مكثفاً`;
      descriptionEn = `Poor knee function (${totalScore}/100)`;
    }

    return { totalScore, ratingCategory, descriptionAr, descriptionEn };
  };

  const lysholmResult = computeLysholm();

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
          مقياس وظيفة الركبة والأربطة (Lysholm Scale)
        </button>
      </div>

      {/* Advisory Banner */}
      <div className="bg-amber-50 border-r-4 border-amber-500 p-3 rounded text-xs text-amber-800">
        <strong>تنبيه سريري استشاري:</strong> هذه المقاييس الوظيفية هي أدوات قياس معتمدة دولياً لمساعدة الأطباء وأخصائيي العلاج الطبيعي على قياس تقدم المريض، ولا تعتبر تشخيصاً آلياً مستقلاً.
      </div>

      {/* 1. OSWESTRY TAB */}
      {activeScale === 'ODI' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900">استبيان مؤشر أوزويستري للعجز (Oswestry Disability Index v2.0)</h3>
                <p className="text-xs text-gray-500 mt-1">يتطلب الإجابة على 8 أقسام على الأقل لحساب النتيجة بشكل سريري موثوق.</p>
              </div>
              <div className="text-left">
                {odiResult ? (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <span className="text-2xl font-black text-blue-700">{odiResult.score}%</span>
                    <p className="text-xs font-semibold text-blue-900 mt-0.5">{odiResult.disabilityCategory}</p>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded border border-gray-200">
                    أجب على {8 - Object.keys(odiAnswers).length} أقسام إضافية
                  </div>
                )}
              </div>
            </div>

            {odiResult && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 font-medium">
                {odiResult.descriptionAr}
              </div>
            )}

            <div className="space-y-4 divide-y divide-gray-100">
              {ODI_SECTIONS.map((sec) => (
                <div key={sec.id} className="pt-3">
                  <h4 className="text-sm font-bold text-gray-800 mb-2">{sec.titleAr}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {sec.options.map((opt) => (
                      <label
                        key={opt.score}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          odiAnswers[sec.id] === opt.score
                            ? 'bg-blue-50 border-blue-500 text-blue-950 font-medium shadow-sm'
                            : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`odi-sec-${sec.id}`}
                          value={opt.score}
                          checked={odiAnswers[sec.id] === opt.score}
                          onChange={() => setOdiAnswers({ ...odiAnswers, [sec.id]: opt.score })}
                          className="mt-0.5"
                        />
                        <span>{opt.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. QUICKDASH TAB */}
      {activeScale === 'QUICKDASH' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900">مقياس إعاقة الذراع والكتف واليد المختصر (QuickDASH)</h3>
                <p className="text-xs text-gray-500 mt-1">يتطلب إكمال 10 أسئلة من أصل 11 لحساب النتيجة المعتمدة (0–100).</p>
              </div>
              <div className="text-left">
                {quickDashResult ? (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-center">
                    <span className="text-2xl font-black text-purple-700">{quickDashResult.score}</span>
                    <span className="text-xs text-purple-600 block">/ 100</span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded border border-gray-200">
                    أجب على {10 - Object.keys(dashAnswers).length} أسئلة إضافية
                  </div>
                )}
              </div>
            </div>

            {quickDashResult && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded text-xs text-purple-900 font-medium">
                {quickDashResult.descriptionAr}
              </div>
            )}

            <div className="space-y-4 divide-y divide-gray-100">
              {QUICKDASH_ITEMS.map((q, idx) => (
                <div key={idx} className="pt-3">
                  <p className="text-sm font-semibold text-gray-800 mb-2">{q}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    {[
                      { val: 1, label: 'بدون صعوبة (1)' },
                      { val: 2, label: 'صعوبة خفيفة (2)' },
                      { val: 3, label: 'صعوبة متوسطة (3)' },
                      { val: 4, label: 'صعوبة شديدة (4)' },
                      { val: 5, label: 'غير قادر تماماً (5)' },
                    ].map((opt) => (
                      <label
                        key={opt.val}
                        className={`flex items-center justify-center p-2 rounded border cursor-pointer text-center ${
                          dashAnswers[idx] === opt.val
                            ? 'bg-purple-50 border-purple-500 text-purple-900 font-bold'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`dash-q-${idx}`}
                          value={opt.val}
                          checked={dashAnswers[idx] === opt.val}
                          onChange={() => setDashAnswers({ ...dashAnswers, [idx]: opt.val })}
                          className="sr-only"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. LYSHOLM KNEE TAB */}
      {activeScale === 'LYSHOLM' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900">مقياس ليزهولم لتقييم الركبة (Lysholm Knee Scale)</h3>
                <p className="text-xs text-gray-500 mt-1">يقيّم الأعراض الوظيفية لإصابات الأربطة الصليبية والغضاريف الهلالية (الدرجة القصوى 100).</p>
              </div>
              <div className="text-left">
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-center">
                  <span className="text-2xl font-black text-teal-700">{lysholmResult.totalScore}</span>
                  <span className="text-xs text-teal-600 block">/ 100 ({lysholmResult.ratingCategory})</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-teal-50 border border-teal-200 rounded text-xs text-teal-900 font-medium">
              {lysholmResult.descriptionAr}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Limp */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">العرج (Limp):</label>
                <select
                  value={lysholmItems.limp}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, limp: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={5}>لا يوجد عرج (5 نقاط)</option>
                  <option value={3}>عرج خفيف أو متقطع (3 نقاط)</option>
                  <option value={0}>عرج شديد ومستمر (0 نقطة)</option>
                </select>
              </div>

              {/* Support */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">استخدام الدعامة / العكاز (Support):</label>
                <select
                  value={lysholmItems.support}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, support: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={5}>لا حاجة لأي دعامة (5 نقاط)</option>
                  <option value={2}>استخدام عصا أو عكاز عند الحاجة (نقطتان)</option>
                  <option value={0}>عدم القدرة على تحمل الوزن بدون عكازات (0 نقطة)</option>
                </select>
              </div>

              {/* Locking */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">انغلاق الركبة (Locking):</label>
                <select
                  value={lysholmItems.locking}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, locking: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={15}>لا يوجد انغلاق أو إحساس بالإمساك (15 نقطة)</option>
                  <option value={10}>إحساس بالإمساك بدون انغلاق حقيقي (10 نقاط)</option>
                  <option value={6}>انغلاق متقطع (6 نقاط)</option>
                  <option value={2}>انغلاق متكرر (نقطتان)</option>
                  <option value={0}>انغلاق مثبت أثناء الفحص (0 نقطة)</option>
                </select>
              </div>

              {/* Instability */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">عدم الاستقرار / خيانة الركبة (Instability):</label>
                <select
                  value={lysholmItems.instability}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, instability: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={25}>لا تخون الركبة أبداً (25 نقطة)</option>
                  <option value={20}>نادراً أثناء ممارسة الرياضة الشديدة (20 نقطة)</option>
                  <option value={15}>بشكل متكرر أثناء الرياضة (15 نقطة)</option>
                  <option value={10}>أحياناً أثناء الأنشطة اليومية (10 نقاط)</option>
                  <option value={5}>بشكل متكرر أثناء الأنشطة اليومية (5 نقاط)</option>
                  <option value={0}>مع كل خطوة (0 نقطة)</option>
                </select>
              </div>

              {/* Pain */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">الألم (Pain):</label>
                <select
                  value={lysholmItems.pain}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, pain: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={25}>لا يوجد ألم (25 نقطة)</option>
                  <option value={20}>ألم خفيف وغير متواصل أثناء المجهود الشاق (20 نقطة)</option>
                  <option value={15}>ألم ملحوظ أثناء المجهود الشاق (15 نقطة)</option>
                  <option value={10}>ألم ملحوظ أثناء أو بعد المشي لأكثر من 2 كم (10 نقاط)</option>
                  <option value={5}>ألم ملحوظ أثناء أو بعد المشي لأقل من 2 كم (5 نقاط)</option>
                  <option value={0}>ألم مستمر (0 نقطة)</option>
                </select>
              </div>

              {/* Swelling */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">التورم (Swelling):</label>
                <select
                  value={lysholmItems.swelling}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, swelling: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={10}>لا يوجد تورم (10 نقاط)</option>
                  <option value={6}>تورم مع المجهود الشديد (6 نقاط)</option>
                  <option value={2}>تورم مع المجهود العادي (نقطتان)</option>
                  <option value={0}>تورم مستمر (0 نقطة)</option>
                </select>
              </div>

              {/* Stair climbing */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">صعود ونزول الدرج (Stair Climbing):</label>
                <select
                  value={lysholmItems.stairClimbing}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, stairClimbing: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={10}>لا توجد أي مشاكل (10 نقاط)</option>
                  <option value={6}>صعوبة خفيفة (6 نقاط)</option>
                  <option value={2}>خطوة واحدة في كل مرة (نقطتان)</option>
                  <option value={0}>غير قادر على صعود الدرج (0 نقطة)</option>
                </select>
              </div>

              {/* Squatting */}
              <div className="border border-gray-200 p-3 rounded-lg">
                <label className="font-bold text-gray-800 block mb-1">القرفصاء (Squatting):</label>
                <select
                  value={lysholmItems.squatting}
                  onChange={(e) => setLysholmItems({ ...lysholmItems, squatting: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded bg-white"
                >
                  <option value={5}>لا توجد أي مشاكل (5 نقاط)</option>
                  <option value={2}>صعوبة خفيفة (نقطتان)</option>
                  <option value={0}>غير قادر على القرفصاء (0 نقطة)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
