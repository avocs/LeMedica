const HOSPITAL_NAMES = [
  "Bumrungrad Intl",
  "Mery Plastic Surgery",
  "Pruksa Clinic",
  "SLC hospital",
  "Panacee Medical Center",
  "The Square Clinic",
  "Vethjani Hospital",
  "Phuket Plastic Surgery Institute",
  "Wansiri Hospital",
  "Prince Court",
  "Raffles Medical",
  "Sunway Medical Center",
  "Thomson Hospital",
  "China Medical University Hospital - 中國醫藥大學附設醫院",
];

const TREATMENT_NAMES = [
  "Health Checkup",
  "Cancer Screening",
  "MRI Scan",
  "CT Scan",
  "PET-CT Scan",
  "Blood Test",
  "Cardiac Screening",
  "Hip & Knee Replacement",
  "Spinal Surgery",
  "Brain Tumor Surgery",
  "Heart Valve Repair",
  "Kidney Transplant",
  "Liver Transplant",
  "LASIK Surgery",
  "Cataract Surgery",
  "Glaucoma Surgery",
  "Gastric Sleeve",
  "Gastric Bypass",
  "Endoscopic Sleeve Gastroplasty",
  "Gender-Affirming Surgery",
  "Pacemaker Implantation",
  "Prostate Surgery",
  "Vasectomy Reversal",
  "Hysterectomy",
  "Fibroid Removal",
  "Corneal Transplant",
  "Deep Brain Stimulation (DBS)",
  "Epilepsy Surgery",
  "Spinal Cord Surgery",
  "Facial Plastic Surgery",
  "Breast Augmentation",
  "Rhinoplasty",
  "Liposuction",
  "Botox Treatment",
  "Dermal Fillers",
  "Hair Transplant",
  "Laser Resurfacing",
  "Buccal Fat Removal",
  "Chin Augmentation",
  "Teeth Whitening",
  "Veneer",
  "Dental Implants",
  "Root Canal",
  "IVF (In Vitro Fertilization)",
  "IUI (Intrauterine Insemination)",
  "Egg Freezing",
  "HRT (Hormone Replacement Therapy)",
  "Chemotherapy",
  "Radiation Therapy",
  "Immunotherapy",
  "Proton Therapy",
  "Detox Retreats",
  "IV Therapy",
  "Anti-Aging Therapy",
  "Physiotherapy",
  "Acupuncture",
  "Ayurveda",
  "Thai Massage",
];

const MIN_HOSPITAL_SCORE = 0.72;
const MIN_TREATMENT_SCORE = 0.7;

/**
 * Normalizes a name string by removing punctuation and lowercasing.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Computes Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] =
          Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]) + 1;
      }
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculates a similarity score between two strings based on Levenshtein distance.
 */
function similarityScore(source: string, candidate: string): number {
  if (!source || !candidate) return 0;
  const normalizedSource = normalize(source);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedSource.length || !normalizedCandidate.length) return 0;
  const distance = levenshtein(normalizedSource, normalizedCandidate);
  const longest = Math.max(normalizedSource.length, normalizedCandidate.length);
  return 1 - distance / longest;
}

/**
 * Attempts to fuzzy-match a raw hospital name string against the curated list
 * from BULK_CSV_UPLOAD_GUIDE.md.
 */
export function matchHospitalName(raw: string): { value: string | null; score: number } {
  if (!raw?.trim()) {
    return { value: null, score: 0 };
  }

  let bestMatch: { value: string | null; score: number } = { value: null, score: 0 };

  for (const hospital of HOSPITAL_NAMES) {
    const score = similarityScore(raw, hospital);
    if (score > bestMatch.score) {
      bestMatch = { value: hospital, score };
    }
  }

  if (bestMatch.score < MIN_HOSPITAL_SCORE) {
    return { value: null, score: bestMatch.score };
  }

  return bestMatch;
}

/**
 * Attempts to fuzzy-match a raw treatment name string against
 * the known set of treatment names from BULK_CSV_UPLOAD_GUIDE.md.
 */
export function matchTreatmentName(raw: string): { value: string | null; score: number } {
  if (!raw?.trim()) {
    return { value: null, score: 0 };
  }

  let bestMatch: { value: string | null; score: number } = { value: null, score: 0 };

  for (const treatment of TREATMENT_NAMES) {
    const score = similarityScore(raw, treatment);
    if (score > bestMatch.score) {
      bestMatch = { value: treatment, score };
    }
  }

  if (bestMatch.score < MIN_TREATMENT_SCORE) {
    return { value: null, score: bestMatch.score };
  }

  return bestMatch;
}

export const matchingReferenceData = {
  hospitals: HOSPITAL_NAMES,
  treatments: TREATMENT_NAMES,
};

