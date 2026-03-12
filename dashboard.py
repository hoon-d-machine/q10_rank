import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client
import requests

# ==============================================================================
# [0] 즐겨찾기 및 고정 색상 설정 (수정 가능)
# ==============================================================================
# 즐겨찾기 브랜드와 해당 브랜드에 부여할 고정 색상입니다.
FAVORITE_BRANDS = {
    "Anua": "#FF4B4B",     # 빨강
    "VT": "#1f77b4",       # 파랑
    "Innisfree": "#2ca02c", # 초록
    "Laneige": "#9467bd"    # 보라
}
DEFAULT_COLOR = "#D3D3D3" # 즐겨찾기 외 브랜드 기본 색상 (필요시 사용)

# ==============================================================================
# [1] 기본 설정 및 연결
# ==============================================================================
st.set_page_config(page_title="Qoo10 메가와리 인사이트", layout="wide", page_icon="📊")

# 세션 상태 초기화 (브랜드 선택 유지용)
if "selected_brands" not in st.session_state:
    st.session_state.selected_brands = []

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

# ==============================================================================
# [2] 데이터 로드 및 전처리
# ==============================================================================
@st.cache_data(ttl=60) 
def load_data():
    all_data = []
    start = 0
    batch_size = 1000
    
    while True:
        response = supabase.table("qoo10_rankings").select("*").order("collected_at", desc=True).range(start, start + batch_size - 1).execute()
        if not response.data: break
        all_data.extend(response.data)
        if len(response.data) < batch_size: break
        start += batch_size
        
    df = pd.DataFrame(all_data)
    if not df.empty:
        df['rank'] = pd.to_numeric(df['rank'], errors='coerce')
        df['sale_price'] = pd.to_numeric(df['sale_price'], errors='coerce')
        df['review_count'] = pd.to_numeric(df['review_count'], errors='coerce')
        df['collected_at'] = pd.to_datetime(df['collected_at']) + pd.Timedelta(hours=9)
        df['display_time'] = df['collected_at'].dt.strftime('%m/%d %H시')
        df['date_only'] = df['collected_at'].dt.date
        cols = ['large_category', 'medium_category', 'small_category', 'brand']
        df[cols] = df[cols].fillna("기타")
    return df

# ==============================================================================
# [3] 메인 화면 로직
# ==============================================================================
st.title("📊 Qoo10 메가와리 랭킹 인사이트")

df = load_data()

if df.empty:
    st.warning("데이터가 없습니다.")
else:
    # --- 사이드바 필터 ---
    st.sidebar.header("🔍 기본 필터")
    
    # 1. 행사 SID
    events = sorted(df['event_sid'].unique(), reverse=True)
    sel_event = st.sidebar.selectbox("행사(SID)", events, index=0)
    filtered_df = df[df['event_sid'] == sel_event]

    # 2. 랭킹 기준 (디폴트 지정 가능)
    r_types = sorted(filtered_df['rank_type'].unique())
    # '누적건수'가 있으면 그것을 디폴트로, 없으면 첫번째 값
    default_r_idx = r_types.index('누적건수') if '누적건수' in r_types else 0
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types, index=default_r_idx)
    filtered_df = filtered_df[filtered_df['rank_type'] == sel_type]

    # 3. 타겟(카테고리)
    cats = sorted(filtered_df['category'].unique())
    sel_cat = st.sidebar.selectbox("타겟(연령/카테고리)", cats, index=0)
    filtered_df = filtered_df[filtered_df['category'] == sel_cat]

    # 4. 기간 설정
    st.sidebar.divider()
    min_date, max_date = filtered_df['date_only'].min(), filtered_df['date_only'].max()
    date_range = st.sidebar.date_input("조회 기간", value=(min_date, max_date))
    
    if len(date_range) == 2:
        filtered_df = filtered_df[(filtered_df['date_only'] >= date_range[0]) & (filtered_df['date_only'] <= date_range[1])]

    # 5. 브랜드 선택 (핵심: session_state 활용)
    st.sidebar.divider()
    st.sidebar.subheader("🏢 브랜드 필터")
    
    all_brands = sorted(filtered_df['brand'].unique())
    
    # 즐겨찾기 버튼
    if st.sidebar.button("⭐ 즐겨찾기 브랜드만 보기"):
        st.session_state.selected_brands = [b for b in FAVORITE_BRANDS.keys() if b in all_brands]

    # 브랜드 멀티 선택 (선택 유지)
    st.session_state.selected_brands = st.sidebar.multiselect(
        "브랜드 선택 (미선택 시 전체)", 
        options=all_brands, 
        default=st.session_state.selected_brands
    )

    if st.session_state.selected_brands:
        final_df = filtered_df[filtered_df['brand'].isin(st.session_state.selected_brands)]
    else:
        final_df = filtered_df

    # 6. 상위 N개 및 색상 설정
    top_n = st.sidebar.selectbox("상위 N개 항목", [5, 10, 20, 50, "전체"], index=2)

    # 색상 맵 생성 (즐겨찾기 브랜드 고정색 적용)
    unique_brands = final_df['brand'].unique()
    color_map = {}
    for b in unique_brands:
        if b in FAVORITE_BRANDS:
            color_map[b] = FAVORITE_BRANDS[b]
        # 즐겨찾기가 아닌 경우 Plotly의 기본 색상을 따르도록 설정 (아래 차트 설정에서 구현)

    # ==========================================================================
    # [4] 시각화
    # ==========================================================================
    def filter_top_n(dataframe, group_col, n_limit):
        if n_limit == "전체": return dataframe
        top_items = dataframe.groupby(group_col)['rank'].min().sort_values().head(n_limit).index.tolist()
        return dataframe[dataframe[group_col].isin(top_items)]

    tab1, tab2 = st.tabs(["📈 순위 트렌드", "💰 가격/리뷰/점유율"])

    with tab1:
        col1, col2 = st.columns(2)
        
        # 1. 브랜드별 트렌드
        with col1:
            st.subheader("🏢 브랜드별 최고 순위")
            chart_df = filter_top_n(final_df, 'brand', top_n)
            brand_trend = chart_df.groupby(['collected_at', 'brand'])['rank'].min().reset_index()
            
            fig = px.line(
                brand_trend, x='collected_at', y='rank', color='brand',
                markers=True, color_discrete_map=color_map, # 고정 색상 적용
                title="브랜드 트렌드"
            )
            fig.update_yaxes(autorange="reversed")
            st.plotly_chart(fig, use_container_width=True)

        # 2. 상품별 트렌드 (브랜드 색상과 통일)
        with col2:
            st.subheader("📦 상품별 순위 (브랜드 색상 통일)")
            prod_df = filter_top_n(final_df, 'goods_no', top_n)
            # 상품 이름 가공
            last_names = prod_df.groupby('goods_no')['goods_name'].last().to_dict()
            prod_df['display_name'] = prod_df['goods_no'].map(lambda x: f"{last_names[x][:15]}..")
            
            fig = px.line(
                prod_df, x='collected_at', y='rank', color='brand', # 색상을 brand로 지정하여 통일
                line_group='goods_no', # 선은 상품별로 분리
                hover_data=['goods_name', 'sale_price'],
                markers=True, color_discrete_map=color_map,
                title="상품 트렌드 (브랜드별 색상 그룹화)"
            )
            fig.update_yaxes(autorange="reversed")
            st.plotly_chart(fig, use_container_width=True)

    with tab2:
        # 기존 트리맵 등 시각화 유지 (color를 brand로 설정하면 색상 통일 가능)
        st.subheader("🔲 브랜드별 카테고리 점유율")
        fig = px.treemap(
            final_df, path=['brand', 'medium_category'], 
            values='sale_price', color='brand',
            color_discrete_map=color_map
        )
        st.plotly_chart(fig, use_container_width=True)

    # 저장 및 새로고침 버튼 등 하단 배치
    if st.sidebar.button("🔄 데이터 새로고침"):
        st.cache_data.clear()
        st.rerun()
