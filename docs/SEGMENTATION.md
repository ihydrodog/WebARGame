# Bbox vs 세그먼트 사용 가능 여부

## 현재 구현 (bbox)

- **COCO-SSD**가 검출 결과로 **bbox** `[x, y, width, height]`만 제공합니다.
- 히트테스트(클릭한 위치가 어떤 오브젝트인지), 크롭(피처 임베딩용), 박스 그리기 모두 이 bbox를 사용합니다.

## 세그먼트 사용 가능 여부

### 1. **person(사람)만 대상일 때 → 세그먼트 사용 가능**

| 항목 | 내용 |
|------|------|
| 모델 | `@tensorflow-models/body-segmentation` (BodyPix / MediaPipe Selfie Segmentation) |
| 출력 | 픽셀 단위 **마스크** (인물 영역만 1, 나머지 0) + 인스턴스별 마스크 가능 |
| 용도 | 히트테스트(클릭 좌표가 어떤 사람 마스크에 속하는지), 크롭 시 **정확한 인물 영역**만 사용 가능 |
| 제한 | **사람만** 지원. 컵, 휴대폰 등 다른 COCO 클래스는 이 모델로 불가 |

- 브라우저에서 바로 사용 가능한 공식 TF.js 패키지입니다.
- `segmentPeople(image)` → 여러 명일 경우 인스턴스별 마스크 리스트를 받을 수 있어, “엄마/아빠”처럼 **특정 한 명**만 골라서 보물로 쓰는 흐름에 잘 맞습니다.

### 2. **그 외 COCO 클래스(컵, 휴대폰 등) → 브라우저용 세그먼트 모델 없음**

| 항목 | 내용 |
|------|------|
| 상황 | COCO 80클래스에 대해 **bbox + 마스크**를 주는 표준 TF.js 모델이 없음 |
| 대안 | Mask R-CNN 등은 Python/Model Garden 중심이라, TF.js로 변환·브라우저 배포는 직접 작업 필요 |
| 결론 | 다른 클래스는 당분간 **bbox만 사용**하는 것이 현실적입니다. |

## 정리

- **적용 원칙**: person만 세그먼트 가능한 게 아니라, **세그먼트가 있는 클래스는 모두 세그먼트 적용**하고 나머지는 bbox. 게임은 타입 구분 없이 `isSegmentAvailableForClass(targetObject)`로 분기.
- **person**: body-segmentation 로드 시 세그먼트 사용.
- **그 외 클래스**: `segment-helper.js`의 **SEGMENT_CLASSES**에 추가 + 해당 모델 연동하면 동일하게 세그먼트 적용됨.

### 프로젝트에서 세그먼트 사용 (모든 타입 공통)

1. **스크립트 추가**  
   `index.html`에 (TF.js 이후):  
   `<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation@2.1.0"></script>`

2. **게임 동작**  
   - `targetObject`가 **person**이면: body-segmentation 로드 시 **세그먼트**로 히트/bbox, 아니면 COCO-SSD bbox.
   - 그 외 타입: 현재는 COCO-SSD bbox. 다른 클래스용 세그먼트 모델 추가 시 **SEGMENT_CLASSES**에만 클래스명 추가하면 동일 흐름으로 적용됨.
