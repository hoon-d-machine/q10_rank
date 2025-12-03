import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client

# [1] 페이지 설정
st.set_page_config(page_title="Qoo10 랭킹 대시보드", layout="wide")

# [2] Supabase 연결
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

# [3] 데이터 로드
@st.cache_data(ttl=600)
def load_data():
    response = supabase.table("qoo10_rankings").select("*").execute()
    df = pd.DataFrame(response.data)
    
    if not df.empty:
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        # 한국 시간 보정 (UTC+9)
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
    return df

# [4] 메인 화면
st.title("📊 Qoo10 메가와리 랭킹 분석")

with st.spinner('데이터를 불러오는 중...'):
    df = load_data()

if df.empty:
    st.warning("수집된 데이터가 없습니다.")
else:
    # --- 사이드바 필터 ---
    st.sidebar.header("🔍 필터 옵션")
    
    # 1. 행사 ID 선택
    events = sorted(df['event_sid'].unique(), reverse=True)
    sel_event = st.sidebar.selectbox("행사(SID) 선택", events)
    df = df[df['event_sid'] == sel_event]

    # 2. 랭킹 기준 (누적건수/금액)
    r_types = df['rank_type'].unique()
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types)
    df = df[df['rank_type'] == sel_type]

    # 3. 조회 기준 (뷰티전체/연령별)
    cats = df['category'].unique()
    sel_cat = st.sidebar.selectbox("조회 기준", cats)
    df = df[df['category'] == sel_cat]
    
    # 4. 브랜드 필터
    all_brands = df['brand'].unique()
    sel_brands = st.sidebar.multiselect("브랜드 필터 (선택 시 해당 브랜드만 표시)", all_brands)
    
    if sel_brands:
        final_df = df[df['brand'].isin(sel_brands)]
    else:
        final_df = df

    # --- 시각화 ---
    st.divider()
    st.subheader(f"📈 {sel_cat} 순위 변동 추이")
    
    if not final_df.empty:
        fig = px.line(
            final_df, 
            x="collected_at", 
            y="rank", 
            color="goods_name",
            # [변경점] 툴팁 데이터 수정 (link, discount_rate 제거됨)
            hover_data=["brand", "sale_price", "large_category"],
            markers=True
        )
        fig.update_yaxes(autorange="reversed", title="순위 (1위가 상단)")
        fig.update_xaxes(title="수집 시간")
        st.plotly_chart(fig, use_container_width=True)
        
        # --- 데이터 테이블 ---
        st.subheader("📋 상세 데이터")
        
        # [변경점] 바뀐 컬럼명으로 테이블 구성
        display_cols = [
            'collected_at', 'rank', 'brand', 'goods_name', 
            'sale_price', 'review_count', 
            'large_category', 'medium_category', 'small_category'
        ]
        
        st.dataframe(
            final_df.sort_values(by=['collected_at', 'rank'], ascending=[False, True])[display_cols],
            use_container_width=True,
            hide_index=True
        )
    else:
        st.info("선택한 조건에 맞는 데이터가 없습니다.")
