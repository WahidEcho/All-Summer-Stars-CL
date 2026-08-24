/**
 * Admin Control Center component barrel.
 *
 * The admin surfaces stay deliberately plainer than the broadcast ones — they
 * are operated on a laptop and a tablet under time pressure — but they draw on
 * the same tokens, so the two halves of the product still read as one thing.
 */

export { AdminShell, type AdminShellProps } from '@/components/admin/AdminShell';
export {
  AdminButton,
  ButtonRow,
  type AdminButtonProps,
  type AdminButtonSize,
  type AdminButtonVariant,
} from '@/components/admin/Button';
export { Callout, type CalloutProps, type CalloutTone } from '@/components/admin/Callout';
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ImpactRow,
} from '@/components/admin/ConfirmDialog';
export {
  ColorInput,
  Field,
  NumberInput,
  RangeInput,
  SegmentedControl,
  SelectInput,
  TextArea,
  TextInput,
  Toggle,
  type ColorInputProps,
  type FieldProps,
  type NumberInputProps,
  type RangeInputProps,
  type TextInputProps,
  type ToggleProps,
} from '@/components/admin/Controls';
export { LoginForm, type LoginFormProps } from '@/components/admin/LoginForm';
export { SaveBar, type SaveBarProps } from '@/components/admin/SaveBar';
export {
  EmptyState,
  FieldGrid,
  KeyValue,
  PageHeader,
  Panel,
  SectionHeading,
  type PageHeaderProps,
  type PanelProps,
} from '@/components/admin/Surface';
export {
  UploadField,
  type MediaBucket,
  type UploadFieldProps,
  type UploadResponse,
} from '@/components/admin/UploadField';

export {
  ChallengeResultPreview,
  type ChallengeResultPreviewProps,
} from '@/components/admin/ChallengeResultPreview';
export {
  DisplayTargetPicker,
  FOLLOW_LIVE,
  TARGET_KEYS,
  describeTarget,
  isPinned,
  sameTarget,
  targetFromPayload,
  targetPayload,
  withoutTarget,
  type DisplayTarget,
  type DisplayTargetPickerProps,
} from '@/components/admin/DisplayTargetPicker';
export {
  challengeStatusLabel,
  isRoundPublished,
  mechanicLabel,
  outcomeName,
  pinReference,
  previewChallengeResult,
  roundProgress,
  roundStatusLabel,
  sideName,
  type LifecycleLabel,
  type RoundProgress,
} from '@/components/admin/challenge-lifecycle';

export {
  CEREMONY_CUES,
  FIRST_CUE,
  LAST_CUE,
  cueAt,
  cueFor,
  cueIndexOf,
  type CeremonyCue,
} from '@/components/admin/ceremony-cues';
export {
  downloadCsv,
  stampedFilename,
  toCsv,
  type CsvColumn,
} from '@/components/admin/csv';
export {
  SCENES,
  SCENE_BY_ID,
  missingSceneFields,
  sceneTitle,
  type SceneDescriptor,
  type ScenePayloadField,
  type ScenePayloadKind,
} from '@/components/admin/scenes';
export {
  useActionRunner,
  type ActionRunner,
  type ActionStatus,
  type RunOptions,
} from '@/components/admin/useActionRunner';
