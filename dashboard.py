import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client

# ==============================================================================
# [1] 기본 설정 및 연결
# ==============================================================================
st.set_page_config(page_title="Qoo10 메가와리 인사이트", layout="wide", page_icon="📊")

# Supabase 연결
try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_KEY = st.secrets["SUPABASE_KEY"]
except:
    st.error("Secrets(비밀번호) 설정이 필요합니다.")
    st.stop()

@st.cache_resource
def init_connection():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_connection()

# 엑셀 변환 함수
@st.cache_data
def convert_df(df):
    return df.to_csv(index=False).encode('utf-8-sig')

# ==============================================================================
# [2] 데이터 로드 및 전처리
# ==============================================================================
@st.cache_data(ttl=600)
def load_data():
    # 전체 데이터 가져오기
    response = supabase.table("qoo10_rankings").select("*").execute()
    df = pd.DataFrame(response.data)
    
    if not df.empty:
        # 시간 변환 (UTC -> KST)
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
        # 차트 표기용 시간 포맷
        df['display_time'] = df['collected_at'].dt.strftime('%m-%d %H시')
        
        # 결측치 처리 (시각화 오류 방지)
        cols = ['large_category', 'medium_category', 'small_category', 'brand']
        df[cols] = df[cols].fillna("기타")
        
    return df

# ==============================================================================
# [3] 메인 화면 로직
# ==============================================================================
st.title("📊 Qoo10 메가와리 랭킹 인사이트")

with st.spinner('데이터를 분석 중입니다...'):
    df = load_data()

if df.empty:
    st.warning("데이터가 없습니다. 수집기를 먼저 실행해주세요.")
else:
    # --- 사이드바: 필터 ---
    st.sidebar.header("🔍 필터 옵션")
    
    # 1. 행사 및 랭킹 기준
    events = sorted(df['event_sid'].unique(), reverse=True)
    sel_event = st.sidebar.selectbox("행사(SID)", events)
    df = df[df['event_sid'] == sel_event]

    r_types = df['rank_type'].unique()
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types)
    df = df[df['rank_type'] == sel_type]

    cats = df['category'].unique()
    sel_cat = st.sidebar.selectbox("타겟(연령/카테고리)", cats)
    df = df[df['category'] == sel_cat]
    
    # 2. 브랜드 필터
    all_brands = sorted(df['brand'].unique())
    sel_brands = st.sidebar.multiselect("브랜드 선택 (다중 가능)", all_brands)
    
    if sel_brands:
        final_df = df[df['brand'].isin(sel_brands)]
    else:
        final_df = df

    # --- 사이드바: 다운로드 ---
    st.sidebar.markdown("---")
    csv_data = convert_df(final_df)
    st.sidebar.download_button(
        "📥 현재 데이터 엑셀 다운로드",
        csv_data,
        f"Qoo10_{sel_event}_{sel_cat}.csv",
        "text/csv"
    )

    # ==========================================================================
    # [4] 시각화 (탭 구조)
    # ==========================================================================
    
    # 상단 요약 지표
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("데이터 수집 건수", f"{len(final_df):,}건")
    m2.metric("분석 브랜드 수", f"{final_df['brand'].nunique()}개")
    m3.metric("평균 판매가", f"¥{int(final_df['sale_price'].mean()):,}")
    m4.metric("평균 리뷰 수", f"{int(final_df['review_count'].mean()):,}개")

    st.divider()

    # 탭 생성
    tab1, tab2, tab3 = st.tabs(["📈 순위 트렌드", "💰 가격/리뷰 분석", "🔲 카테고리 점유율"])

    # --------------------------------------------------------------------------
    # TAB 1: 순위 트렌드 (상품별, 브랜드별)
    # --------------------------------------------------------------------------
    with tab1:
        col1, col2 = st.columns(2)
        
        # 1. 브랜드별 평균 순위 변화 (신규 추가)
        with col1:
            st.subheader("🏢 브랜드별 평균 순위 추이")
            # 브랜드별, 시간별 평균 순위 계산
            brand_trend = final_df.groupby(['collected_at', 'brand'])['rank'].mean().reset_index()
            
            fig_brand = px.line(
                brand_trend, x='collected_at', y='rank', color='brand',
                markers=True, title="브랜드 평균 순위 (낮을수록 좋음)"
            )
            fig_brand.update_yaxes(autorange="reversed")
            st.plotly_chart(fig_brand, use_container_width=True)

        # 2. 상품별 순위 변화 (기존)
        with col2:
            st.subheader("📦 상품별 순위 변동")
            fig_prod = px.line(
                final_df, x="collected_at", y="rank", color="goods_name",
                hover_data=["brand", "sale_price", "large_category"],
                markers=True, title="개별 상품 순위"
            )
            fig_prod.update_yaxes(autorange="reversed")
            fig_prod.update_layout(showlegend=False) # 범례가 너무 많으면 가림
            st.plotly_chart(fig_prod, use_container_width=True)

    # --------------------------------------------------------------------------
    # TAB 2: 가격/리뷰 분석 (스캐터, 박스플롯)
    # --------------------------------------------------------------------------
    with tab2:
        col3, col4 = st.columns(2)
        
        # 3. 가격 vs 리뷰 vs 랭킹 (스캐터)
        with col3:
            st.subheader("🔵 가격과 리뷰 수가 순위에 미치는 영향")
            fig_scat = px.scatter(
                final_df, x="sale_price", y="rank", 
                size="review_count", color="large_category",
                hover_data=["goods_name", "brand"],
                title="X:가격 / Y:순위 / 크기:리뷰수"
            )
            fig_scat.update_yaxes(autorange="reversed")
            st.plotly_chart(fig_scat, use_container_width=True)

        # 4. 카테고리별 가격 분포 (박스플롯)
        with col4:
            st.subheader("💰 중분류별 가격대 분포")
            fig_box = px.box(
                final_df, x="medium_category", y="sale_price", 
                color="medium_category", points="all",
                title="카테고리별 가격 범위 (최저/최고/평균)"
            )
            st.plotly_chart(fig_box, use_container_width=True)

    # --------------------------------------------------------------------------
    # TAB 3: 카테고리 점유율 (트리맵, 썬버스트)
    # --------------------------------------------------------------------------
    with tab3:
        col5, col6 = st.columns(2)
        
        # 5. 카테고리 계층 (트리맵)
        with col5:
            st.subheader("🔲 카테고리 계층 분석 (트리맵)")
            fig_tree = px.treemap(
                final_df, 
                path=[px.Constant("전체"), 'large_category', 'medium_category', 'brand'], 
                values='sale_price', # 박스 크기 기준 (매출액 규모 추정)
                title="대분류 > 중분류 > 브랜드 비중"
            )
            st.plotly_chart(fig_tree, use_container_width=True)

        # 6. 카테고리 세부 (썬버스트)
        with col6:
            st.subheader("☀️ 카테고리 세부 비중 (썬버스트)")
            fig_sun = px.sunburst(
                final_df,
                path=['large_category', 'medium_category', 'small_category'],
                values='sale_price',
                title="대분류 > 중분류 > 소분류 비중"
            )
            st.plotly_chart(fig_sun, use_container_width=True)

    # ==========================================================================
    # [5] 상세 데이터 테이블
    # ==========================================================================
    st.divider()
    with st.expander("📋 상세 데이터 원본 보기 (클릭)", expanded=False):
        st.dataframe(
            final_df.sort_values(by=['collected_at', 'rank'], ascending=[False, True]),
            use_container_width=True,
            hide_index=True
        )
