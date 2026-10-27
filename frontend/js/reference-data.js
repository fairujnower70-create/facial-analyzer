// Reference dataset for face-shape classification.
//
// What this is: a small set of labeled reference vectors — one centroid per
// face-shape archetype, each defined by four normalized ratios computed the
// same way as a live scan (see analyze.js -> computeRatioVector). The
// centroids are averaged from published craniofacial-proportion ranges used
// in facial-analysis literature and styling guides, not learned from a
// corpus of photos — we don't have a labeled image dataset or a training
// pipeline available in this environment. Swapping this file for centroids
// computed from a real labeled dataset (e.g. running computeRatioVector over
// a landmark-annotated face-shape dataset and averaging per class) would be
// a drop-in accuracy upgrade; the classifier code does not need to change.
//
// Ratio definitions (all computed from 68-point landmarks):
//   heightToCheekWidth   = faceHeight / cheekboneWidth
//   jawToCheekWidth      = jawWidth / cheekboneWidth
//   foreheadToCheekWidth = foreheadWidth / cheekboneWidth
//   jawToForehead        = jawWidth / foreheadWidth

const FACE_SHAPE_REFERENCE = [
  {
    shape: 'Oval',
    ratios: { heightToCheekWidth: 1.42, jawToCheekWidth: 0.82, foreheadToCheekWidth: 0.86, jawToForehead: 0.95 },
    description: 'Balanced proportions; face is longer than it is wide, jaw gently tapered.'
  },
  {
    shape: 'Round',
    ratios: { heightToCheekWidth: 1.08, jawToCheekWidth: 0.93, foreheadToCheekWidth: 0.90, jawToForehead: 1.03 },
    description: 'Face width and height are close; soft jawline with little angularity.'
  },
  {
    shape: 'Square',
    ratios: { heightToCheekWidth: 1.15, jawToCheekWidth: 0.97, foreheadToCheekWidth: 0.95, jawToForehead: 1.02 },
    description: 'Jaw, cheekbones, and forehead are similarly wide; strong, angular jawline.'
  },
  {
    shape: 'Heart',
    ratios: { heightToCheekWidth: 1.30, jawToCheekWidth: 0.70, foreheadToCheekWidth: 0.97, jawToForehead: 0.72 },
    description: 'Wide forehead, narrow jaw, often a pointed chin.'
  },
  {
    shape: 'Long',
    ratios: { heightToCheekWidth: 1.62, jawToCheekWidth: 0.80, foreheadToCheekWidth: 0.82, jawToForehead: 0.98 },
    description: 'Noticeably longer than wide, with a straight cheek line.'
  },
  {
    shape: 'Diamond',
    ratios: { heightToCheekWidth: 1.35, jawToCheekWidth: 0.68, foreheadToCheekWidth: 0.75, jawToForehead: 1.10 },
    description: 'Cheekbones are the widest point; forehead and jaw both taper in.'
  }
];

// Color map for expression badges/bars — distinct, high-contrast per
// emotion so results are scannable at a glance. Keys match the expression
// names face-api.js returns (unchanged from the original analysis engine).
const EXPRESSION_COLORS = {
  happy: '#10b981', // emerald
  sad: '#3b82f6', // muted blue
  angry: '#f43f5e', // rose red
  surprised: '#f59e0b', // amber
  neutral: '#94a3b8', // slate
  fearful: '#a78bfa', // light violet
  disgusted: '#84cc16', // lime
  // derived (heuristic) moods — see vision-core.js
  funny: '#22d3ee', // cyan
  excited: '#e879f9', // fuchsia
  shy: '#f9a8d4', // soft pink
  contempt: '#14b8a6' // teal
};

// Typical population asymmetry baseline used to calibrate the symmetry
// score. Facial-symmetry studies commonly report average left/right
// landmark deviations in the low single-digit percentages for healthy
// adult faces; we use that as the "expected" noise floor so the reported
// score reflects deviation beyond normal human asymmetry rather than
// penalizing every face for the asymmetry everyone naturally has.
const SYMMETRY_BASELINE_DEVIATION = 0.035; // ~3.5% average landmark deviation
