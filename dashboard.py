import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client
from datetime import datetime, timedelta

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
# [2] 데이터 로드
# ==============================================================================
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
        if not response.data: break
        all_data.extend(response.data)
        if len(response.data) < batch_size: break
        start += batch_size
        
    df = pd.DataFrame(all_data)
    
    if not df.empty:
        # 시간 변환
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
        # 차트 표기용
        df['display_time'] = df['collected_at'].dt.strftime('%m/%d %H시')
        # 날짜 필터링용 (시간 제외)
        df['date_only'] = df['collected_at'].dt.date
        
        cols = ['large_category', 'medium_category', 'small_category', 'brand']
        df[cols] = df[cols].fillna("기타")
        
    return df

# ==============================================================================
# [3] 메인 화면 로직
# ==============================================================================
st.title("📊 Qoo10 메가와리 랭킹 인사이트")

if st.button("🔄 데이터 즉시 새로고침"):
    st.cache_data.clear()
    st.rerun()

with st.spinner('데이터 분석 중...'):
    df = load_data()

if df.empty:
    st.warning("데이터가 없습니다. 수집기를 먼저 실행해주세요.")
else:
    # --------------------------------------------------------------------------
    # [사이드바] 필터 옵션
    # --------------------------------------------------------------------------
    st.sidebar.header("🔍 기본 필터")
    
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
    
    # 2. 기간 선택 (달력)
    st.sidebar.divider()
    st.sidebar.subheader("📅 기간 설정")
    
    min_date = df['date_only'].min()
    max_date = df['date_only'].max()
    
    date_range = st.sidebar.date_input(
        "조회 기간 선택",
        value=(min_date, max_date), # 기본값: 전체 기간
        min_value=min_date,
        max_value=max_date
    )
    
    # 기간 필터링 적용
    if len(date_range) == 2:
        start_date, end_date = date_range
        df = df[
            (df['date_only'] >= start_date) & 
            (df['date_only'] <= end_date)
        ]
    
    # 3. 상위 N개 보기 (드롭다운)
    st.sidebar.divider()
    st.sidebar.subheader("📊 시각화 옵션")
    
    top_n_options = [5, 10, 15, 20, 30, 50, "전체"]
    top_n = st.sidebar.selectbox("상위 N개 항목만 보기", top_n_options, index=1) # 기본값: 10개
    
    # 4. 브랜드 필터
    all_brands = sorted(df['brand'].unique())
    sel_brands = st.sidebar.multiselect("브랜드 직접 선택 (옵션)", all_brands)
    
    if sel_brands:
        final_df = df[df['brand'].isin(sel_brands)]
    else:
        final_df = df

    # --- 다운로드 버튼 ---
    st.sidebar.markdown("---")
    st.sidebar.download_button("🔍 현재 데이터 받기", convert_df(final_df), "filtered_data.csv", "text/csv")

    # ==========================================================================
    # [4] 시각화
    # ==========================================================================
    
    st.divider()
    
    # [함수] Top N 필터링 로직 (그래프마다 적용)
    def filter_top_n(dataframe, group_col, n_limit):
        if n_limit == "전체":
            return dataframe
        
        # '최고 순위(min rank)'가 가장 높은(숫자가 작은) 순서대로 N개 추출
        top_items = dataframe.groupby(group_col)['rank'].min().sort_values().head(n_limit).index
        return dataframe[dataframe[group_col].isin(top_items)]

    tab1, tab2, tab3 = st.tabs(["📈 순위 트렌드", "💰 가격/리뷰 분석", "🔲 카테고리 점유율"])

    # --- TAB 1: 순위 트렌드 ---
    with tab1:
        col1, col2 = st.columns(2)
        
        # 1. 브랜드별
        with col1:
            st.subheader(f"🏢 브랜드 Top {top_n} 순위")
            if not final_df.empty:
                # Top N 필터 적용
                chart_df = filter_top_n(final_df, 'brand', top_n)
                
                # 시각화 데이터 집계
                brand_trend = chart_df.groupby(['collected_at', 'display_time', 'brand'])['rank'].min().reset_index()
                brand_trend = brand_trend.sort_values('collected_at')
                
                # 범례 정렬
                sorted_brands = brand_trend.groupby('brand')['rank'].min().sort_values().index.tolist()
                
                fig = px.line(
                    brand_trend, x='display_time', y='rank', color='brand',
                    markers=True, title="브랜드별 최고 순위 흐름",
                    category_orders={"brand": sorted_brands}
                )
                fig.update_yaxes(autorange="reversed")
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("데이터가 없습니다.")

        # 2. 상품별
        with col2:
            st.subheader(f"📦 상품 Top {top_n} 순위")
            if not final_df.empty:
                # Top N 필터 적용
                chart_df = filter_top_n(final_df, 'goods_name', top_n)
                chart_df = chart_df.sort_values('collected_at')
                
                sorted_goods = chart_df.groupby('goods_name')['rank'].min().sort_values().index.tolist()
                
                fig = px.line(
                    chart_df, x="display_time", y="rank", color="goods_name",
                    hover_data=["brand", "sale_price"],
                    markers=True, title="개별 상품 순위 흐름",
                    category_orders={"goods_name": sorted_goods}
                )
                fig.update_yaxes(autorange="reversed")
                # Top N개일 때는 범례를 보여주고, '전체'일 때만 숨김
                fig.update_layout(showlegend=(top_n != "전체")) 
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("데이터가 없습니다.")

    # --- TAB 2: 가격/리뷰 ---
    with tab2:
        col3, col4 = st.columns(2)
        
        with col3:
            st.subheader("🔵 가격 vs 리뷰 (Top 상품)")
            if not final_df.empty:
                # 너무 많으면 느리므로 Top N 필터 적용
                chart_df = filter_top_n(final_df, 'goods_name', top_n)
                
                fig = px.scatter(
                    chart_df, x="sale_price", y="rank", 
                    size="review_count", color="large_category",
                    hover_data=["goods_name", "brand"],
                    title=f"가격 분포와 순위 (상위 {top_n}개)"
                )
                fig.update_yaxes(autorange="reversed")
                st.plotly_chart(fig, use_container_width=True)

        with col4:
            st.subheader("💰 카테고리별 가격대")
            if not final_df.empty:
                fig = px.box(
                    final_df, x="medium_category", y="sale_price", 
                    color="medium_category", points="all",
                    title="중분류별 가격 범위"
                )
                st.plotly_chart(fig, use_container_width=True)

    # --- TAB 3: 카테고리 ---
    with tab3:
        col5, col6 = st.columns(2)
        # 트리맵/썬버스트는 전체 구조를 보는 게 좋아서 Top N 미적용 (필요시 적용 가능)
        with col5:
            st.subheader("🔲 카테고리 점유율")
            if not final_df.empty:
                fig = px.treemap(
                    final_df, 
                    path=[px.Constant("전체"), 'large_category', 'medium_category', 'brand'], 
                    values='sale_price', color='large_category',
                    color_discrete_sequence=px.colors.qualitative.Pastel
                )
                st.plotly_chart(fig, use_container_width=True)
        with col6:
            st.subheader("☀️ 세부 계층 구조")
            if not final_df.empty:
                fig = px.sunburst(
                    final_df,
                    path=['large_category', 'medium_category', 'small_category'],
                    values='sale_price', color='large_category',
                    color_discrete_sequence=px.colors.qualitative.Pastel
                )
                st.plotly_chart(fig, use_container_width=True)

    # --- 상세 테이블 ---
    st.divider()
    with st.expander("📋 필터링된 데이터 원본 보기"):
        view_cols = ['display_time', 'rank', 'brand', 'goods_name', 'sale_price', 'review_count', 'large_category']
        st.dataframe(
            final_df.sort_values(by=['collected_at', 'rank'])[view_cols],
            use_container_width=True, hide_index=True
        )
