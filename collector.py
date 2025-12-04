import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client

# ==============================================================================
# [1] 기본 설정 및 연결
# ==============================================================================
st.set_page_config(page_title="Qoo10 메가와리 인사이트", layout="wide", page_icon="📊")

try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_KEY = st.secrets["SUPABASE_KEY"]
except:
    st.error("Secrets 설정이 필요합니다.")
    st.stop()

@st.cache_resource
def init_connection():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_connection()

@st.cache_data
def convert_df(df):
    return df.to_csv(index=False).encode('utf-8-sig')

# ==============================================================================
# [2] 데이터 로드 (캐시 시간 단축: 10분 -> 1분)
# ==============================================================================
# [수정] ttl=60으로 줄여서 새 데이터가 금방 반영되게 함
@st.cache_data(ttl=60) 
def load_data():
    all_data = []
    start = 0
    batch_size = 1000
    
    while True:
        response = supabase.table("qoo10_rankings") \
            .select("*") \
            .order("collected_at", desc=True) \
            .range(start, start + batch_size - 1) \
            .execute()
    
        if not response.data:
            break
            
        all_data.extend(response.data)

        if len(response.data) < batch_size:
            break
            
        start += batch_size
        
    df = pd.DataFrame(all_data)
    
    if not df.empty:
        # 시간 변환
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
        
        # 그래프용 시간 포맷
        df['display_time'] = df['collected_at'].dt.strftime('%m/%d %H시')
        
        # 결측치 처리
        cols = ['large_category', 'medium_category', 'small_category', 'brand']
        df[cols] = df[cols].fillna("기타")
        
    return df
# ==============================================================================
# [3] 메인 화면 로직
# ==============================================================================
st.title("📊 Qoo10 메가와리 랭킹 인사이트")

# 새로고침 버튼 (캐시 강제 초기화용)
if st.button("🔄 데이터 즉시 새로고침"):
    st.cache_data.clear()
    st.rerun()

with st.spinner('데이터를 분석 중입니다...'):
    df = load_data()

if df.empty:
    st.warning("데이터가 없습니다. 수집기를 먼저 실행해주세요.")
else:
    # --- 사이드바: 필터 ---
    st.sidebar.header("🔍 필터 옵션")
    
    events = sorted(df['event_sid'].unique(), reverse=True)
    sel_event = st.sidebar.selectbox("행사(SID)", events)
    df = df[df['event_sid'] == sel_event]

    r_types = df['rank_type'].unique()
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types)
    df = df[df['rank_type'] == sel_type]

    cats = df['category'].unique()
    sel_cat = st.sidebar.selectbox("타겟(연령/카테고리)", cats)
    df = df[df['category'] == sel_cat]
    
    all_brands = sorted(df['brand'].unique())
    sel_brands = st.sidebar.multiselect("브랜드 선택", all_brands)
    
    if sel_brands:
        final_df = df[df['brand'].isin(sel_brands)]
    else:
        final_df = df

    # --- 사이드바: 다운로드 ---
    st.sidebar.markdown("---")
    csv_filtered = convert_df(final_df)
    st.sidebar.download_button("🔍 필터된 데이터 받기", csv_filtered, f"Filtered_{sel_event}.csv", "text/csv")
    
    st.sidebar.write("")
    csv_full = convert_df(df)
    st.sidebar.download_button("💾 전체 원본 받기", csv_full, f"Raw_{sel_event}.csv", "text/csv")

    # ==========================================================================
    # [4] 시각화 (X축 display_time 적용)
    # ==========================================================================
    
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("데이터 수집 건수", f"{len(final_df):,}건")
    m2.metric("분석 브랜드 수", f"{final_df['brand'].nunique()}개")
    m3.metric("평균 판매가", f"¥{int(final_df['sale_price'].mean()):,}")
    m4.metric("평균 리뷰 수", f"{int(final_df['review_count'].mean()):,}개")

    st.divider()

    tab1, tab2, tab3 = st.tabs(["📈 순위 트렌드", "💰 가격/리뷰 분석", "🔲 카테고리 점유율"])

    with tab1:
        col1, col2 = st.columns(2)
        
        # 1. 브랜드별 최고 순위 (X축 수정됨)
        with col1:
            st.subheader("🏆 브랜드별 최고 순위 (Top Rank)")
            
            if not final_df.empty:
                # [중요] display_time도 그룹핑에 포함해야 그래프에 나옵니다.
                brand_trend = final_df.groupby(['collected_at', 'display_time', 'brand'])['rank'].min().reset_index()
                
                # 순서 보장을 위해 collected_at 기준 정렬
                brand_trend = brand_trend.sort_values('collected_at')
                
                # 범례 정렬 (1위 많이 한 순서)
                sorted_brands = brand_trend.groupby('brand')['rank'].min().sort_values(ascending=True).index.tolist()
                
                fig_brand = px.line(
                    brand_trend, 
                    x='display_time', # [수정] 여기가 display_time이어야 함
                    y='rank', 
                    color='brand',
                    markers=True, 
                    title="브랜드별 최고 순위 (낮을수록 좋음)",
                    category_orders={"brand": sorted_brands}
                )
                fig_brand.update_yaxes(autorange="reversed", title="순위 (Top Rank)")
                fig_brand.update_xaxes(title="수집 시간")
                st.plotly_chart(fig_brand, use_container_width=True)
            else:
                st.info("데이터가 없습니다.")

        # 2. 상품별 순위 (X축 수정됨)
        with col2:
            st.subheader("📦 상품별 순위 변동")
            if not final_df.empty:
                # 상품도 시간순 정렬 필수
                prod_trend = final_df.sort_values('collected_at')
                sorted_goods = prod_trend.groupby('goods_name')['rank'].min().sort_values(ascending=True).index.tolist()
                
                fig_prod = px.line(
                    prod_trend, 
                    x="display_time", # [수정] display_time 사용
                    y="rank", 
                    color="goods_name",
                    hover_data=["brand", "sale_price", "large_category"],
                    markers=True, title="개별 상품 순위",
                    category_orders={"goods_name": sorted_goods}
                )
                fig_prod.update_yaxes(autorange="reversed", title="순위")
                fig_prod.update_xaxes(title="수집 시간")
                fig_prod.update_layout(showlegend=False)
                st.plotly_chart(fig_prod, use_container_width=True)
            else:
                st.info("데이터가 없습니다.")

    # (TAB 2, TAB 3는 시간축을 안 쓰므로 기존 유지)
    with tab2:
        col3, col4 = st.columns(2)
        with col3:
            st.subheader("🔵 가격 vs 리뷰수 vs 랭킹")
            if not final_df.empty:
                fig_scat = px.scatter(
                    final_df, x="sale_price", y="rank", 
                    size="review_count", color="large_category",
                    hover_data=["goods_name", "brand"],
                    title="X:가격 / Y:순위 / 크기:리뷰수"
                )
                fig_scat.update_yaxes(autorange="reversed")
                st.plotly_chart(fig_scat, use_container_width=True)
        with col4:
            st.subheader("💰 중분류별 가격대")
            if not final_df.empty:
                fig_box = px.box(
                    final_df, x="medium_category", y="sale_price", 
                    color="medium_category", points="all",
                    title="가격 범위 (Box Plot)"
                )
                st.plotly_chart(fig_box, use_container_width=True)

    with tab3:
        col5, col6 = st.columns(2)
        
        # 5. 카테고리 계층 (트리맵)
        with col5:
            st.subheader("🔲 카테고리 계층 분석 (트리맵)")
            if not final_df.empty:
                fig_tree = px.treemap(
                    final_df, 
                    path=[px.Constant("전체"), 'large_category', 'medium_category', 'brand'], 
                    values='sale_price',
                    color='large_category', 
                    color_discrete_sequence=px.colors.qualitative.Pastel, 
                    title="대분류 > 중분류 > 브랜드 비중"
                )
                st.plotly_chart(fig_tree, use_container_width=True)
            else:
                st.info("표시할 데이터가 없습니다.")

        # 6. 카테고리 세부 (썬버스트)
        with col6:
            st.subheader("☀️ 카테고리 세부 비중 (썬버스트)")
            if not final_df.empty:
                fig_sun = px.sunburst(
                    final_df,
                    path=['large_category', 'medium_category', 'small_category'],
                    values='sale_price',
                    color='large_category',
                    color_discrete_sequence=px.colors.qualitative.Pastel, 
                    title="대분류 > 중분류 > 소분류 비중"
                )
                st.plotly_chart(fig_sun, use_container_width=True)
            else:
                st.info("표시할 데이터가 없습니다.")

    # ==========================================================================
    # [5] 상세 데이터 테이블
    # ==========================================================================
    st.divider()
    with st.expander("📋 상세 데이터 원본 보기", expanded=False):
        # 테이블에서도 예쁜 시간(display_time)이 맨 앞에 오도록 정리
        view_cols = ['display_time', 'rank', 'brand', 'goods_name', 'sale_price', 'review_count', 'large_category']
        st.dataframe(
            final_df.sort_values(by=['collected_at', 'rank'], ascending=[False, True])[view_cols],
            use_container_width=True,
            hide_index=True
        )
