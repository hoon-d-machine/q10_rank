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

# [3] 데이터 로드 (수정됨: 시간 포맷팅 추가)
@st.cache_data(ttl=600)
def load_data():
    # DB에서 데이터 가져오기
    response = supabase.table("qoo10_rankings").select("*").execute()
    df = pd.DataFrame(response.data)
    
    if not df.empty:
        # 1. 날짜형식 변환
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        
        # 2. 한국 시간 보정 (UTC+9)
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
        
        # 3. [NEW] 보여주기용 시간 컬럼 생성 (예: 2025-03-01 14시)
        # 분/초를 떼어내고 '시'를 붙입니다.
        df['display_time'] = df['collected_at'].dt.strftime('%Y-%m-%d %H시')
        
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
    
    # 1. 행사 ID
    events = sorted(df['event_sid'].unique(), reverse=True)
    sel_event = st.sidebar.selectbox("행사(SID) 선택", events)
    df = df[df['event_sid'] == sel_event]

    # 2. 랭킹 기준
    r_types = df['rank_type'].unique()
    sel_type = st.sidebar.selectbox("랭킹 기준", r_types)
    df = df[df['rank_type'] == sel_type]

    # 3. 조회 기준
    cats = df['category'].unique()
    sel_cat = st.sidebar.selectbox("조회 기준", cats)
    df = df[df['category'] == sel_cat]
    
    # 4. 브랜드 필터
    all_brands = df['brand'].unique()
    sel_brands = st.sidebar.multiselect("브랜드 필터", all_brands)
    
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
            x="collected_at", # X축은 순서 보장을 위해 원본 시간 사용
            y="rank", 
            color="goods_name",
            # [수정] 툴팁에 'display_time'을 보여줘서 깔끔하게 표시
            hover_data={
                "collected_at": False, # 원본 시간 숨김
                "display_time": True,  # 포맷된 시간 표시
                "brand": True, 
                "sale_price": True, 
                "large_category": True
            },
            markers=True
        )
        fig.update_yaxes(autorange="reversed", title="순위 (1위가 상단)")
        fig.update_xaxes(title="수집 시간")
        
        # 툴팁 라벨 한글화
        fig.update_traces(
            hovertemplate="<br>".join([
                "<b>%{text}</b>", # 상품명 (color로 지정된 것)
                "시간: %{customdata[0]}",
                "순위: %{y}위",
                "브랜드: %{customdata[1]}",
                "가격: %{customdata[2]:,}엔"
            ])
        )
        st.plotly_chart(fig, use_container_width=True)
        
        # --- 데이터 테이블 ---
        st.subheader("📋 상세 데이터")
        
        # [수정] 테이블에 'collected_at' 대신 'display_time' 표시
        display_cols = [
            'display_time', 'rank', 'brand', 'goods_name', 
            'sale_price', 'review_count', 
            'large_category', 'medium_category', 'small_category'
        ]
        
        # 컬럼명 한글로 변경 (보기 좋게)
        rename_dict = {
            'display_time': '수집시간',
            'rank': '순위',
            'brand': '브랜드',
            'goods_name': '상품명',
            'sale_price': '판매가',
            'review_count': '리뷰수',
            'large_category': '대분류',
            'medium_category': '중분류',
            'small_category': '소분류'
        }
        
        st_df = final_df.sort_values(by=['collected_at', 'rank'], ascending=[False, True])[display_cols]
        st_df = st_df.rename(columns=rename_dict)
        
        st.dataframe(
            st_df,
            use_container_width=True,
            hide_index=True
        )
    else:
        st.info("선택한 조건에 맞는 데이터가 없습니다.")
