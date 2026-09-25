/**
 * @deprecated 월 단일 진단은 `tfCloseSettleAssessment`로 통합됨. 호환용 re-export.
 */
export {
  buildTfCloseSettleRow,
  buildTfCloseSettleBoard,
  verdictColor,
  fmtPrice,
  TF_CLOSE_SETTLE_ORDER,
  confirmedEdgeColor,
  type TfCloseSettleRow,
  type TfCloseSettleBoard,
  type TfCloseSettleTf,
  type FormingSettleVerdict,
} from './tfCloseSettleAssessment';
