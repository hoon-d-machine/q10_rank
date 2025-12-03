import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client

# [1] 페이지 설정
st.set_page_config(page_title="Qoo10 랭킹 대시보드", layout="wide")

# [2] Supabase 연결 (Streamlit Secrets에서 가져옴)
# 주의: 이 코드는 로컬에서 바로 실행하면 에러가 납니다. (웹 배포용)
try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_KEY = st.secrets["SUPABASE_KEY"]
except:
    st.error("비밀번호 설정이 필요합니다.")
    st.stop()

@st.cache_resource
def init_connection():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_connection()

# [3] 데이터 로드 함수
@st.cache_data(ttl=600) # 10분마다 데이터 갱신
def load_data():
    # 데이터가 많아지면 최근 행사만 가져오도록 쿼리 수정 가능
    response = supabase.table("qoo10_rankings").select("*").execute()
    df = pd.DataFrame(response.data)
    
    if not df.empty:
        # 시간 변환
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        # 한국 시간으로 조정 (UTC -> KST)
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
    return df

# [4] 메인 UI
st.title("📊 Qoo10 메가와리 실시간 분석")

with st.spinner('데이터를 불러오는 중...'):
    df = load_data()

if df.empty:
    st.warning("아직 수집된 데이터가 없습니다.")
else:
    # 사이드바 필터
    st.sidebar.header("🔍 필터")
    
    # 행사 선택
    events = df['event_sid'].unique()
    selected_event = st.sidebar.selectbox("행사(SID) 선택", events, index=0)
    
    # 행사 필터링
    df_event = df[df['event_sid'] == selected_event]
    
    # 랭킹 유형
    r_types = df_event['rank_type'].unique()
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types)
    
    # 카테고리
    cats = df_event[df_event['rank_type'] == sel_type]['category'].unique()
    sel_cat = st.sidebar.selectbox("카테고리/연령", cats)
    
    # 최종 데이터
    final_df = df_event[
        (df_event['rank_type'] == sel_type) & 
        (df_event['category'] == sel_cat)
    ]
    
    # --- 시각화 ---
    st.subheader(f"📈 {sel_cat} 순위 변동")
    
    # 브랜드 선택 (옵션)
    all_brands = final_df['brand'].unique()
    sel_brands = st.sidebar.multiselect("브랜드 필터", all_brands)
    
    if sel_brands:
        chart_df = final_df[final_df['brand'].isin(sel_brands)]
    else:
        chart_df = final_df
        
    fig = px.line(
        chart_df, 
        x="collected_at", 
        y="rank", 
        color="goods_name",
        hover_data=["brand", "price"],
        markers=True
    )
    fig.update_yaxes(autorange="reversed") # 1위가 위로
    st.plotly_chart(fig, use_container_width=True)
    
    # 데이터 테이블
    with st.expander("📋 원본 데이터 보기"):
        st.dataframe(final_df.sort_values(by=['collected_at', 'rank'], ascending=[False, True]))