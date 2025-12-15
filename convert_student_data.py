#!/usr/bin/env python3
"""
Script to convert student data into proper JSON format for bulk upload
"""

import json
import re
from datetime import datetime

def parse_date(date_str):
    """Parse various date formats and return YYYY-MM-DD"""
    if not date_str or date_str.strip() == '':
        return None
    
    date_str = date_str.strip()
    
    # Handle DD/MM/YYYY format
    if '/' in date_str:
        parts = date_str.split('/')
        if len(parts) == 3:
            try:
                day, month, year = parts
                if len(year) == 2:
                    year = '20' + year if int(year) < 50 else '19' + year
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            except:
                pass
    
    # Handle DD-MM-YYYY format
    if '-' in date_str and len(date_str.split('-')) == 3:
        parts = date_str.split('-')
        try:
            day, month, year = parts
            if len(year) == 2:
                year = '20' + year if int(year) < 50 else '19' + year
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        except:
            pass
    
    return None

def clean_text(text):
    """Clean and normalize text"""
    if not text:
        return ""
    return text.strip().replace('"', '').replace("'", "")

def convert_student_data():
    """Convert the raw student data to JSON format"""
    
    # Raw student data from the user
    raw_data = """28/2006	Shrijith J.Bale	12/11/94	30.8	O +ve	Rig Veda	Kaundinya	9325544168	Bale Jayant		Lab technician	Indian	Hindu	Brahmin	Konkani	HOUSE NO.279, Near VIDYA BHAWAN, COMBA, MARGAO, Goa	Same	VVMVP	10th	"203/10-11
11-12-2010"	Prathama	22/06/06	19.2		
10/2008	Basudev Aryal	09/10/95	29.9	B +ve	Atharvana Veda	Athreya	9847078791	Gopal Prasad Aryal		Business	Nepali	Hindu	Brahmin	Nepali	Shankernagar-1 Dist. Rupandehi, Nepal	Same	P B H S S	7th	8	Prathama	15/05/08	17.3		
01/2008	Satish. C	21/09/96	29.0	B +ve	Rig Veda	Rathitara	9741010818	Chandrashekar		Business	Indian	Hindu	Brahmin	Kannada	U-31, 14 Cross, Maruti badavane palace Guttalli, malleshwaram, Bangalore. Karnataka	Same	VVMVP	7th	"16/08-09
date 6-6-2008"	Prathama	05/06/08	17.2		
04/2008	Nikhil Kumar Sharma	17/05/00	25.3	AB +ve	Rig Veda	Shandilya	9631315627	Rajesh Sharma		Farmer	Indian	Hindu	Brahmin	Hindi	Aranda, Aurangabad,  Bihar	Same	Zilla Shiksha Adeeshak	5th	0	Prathama	05/06/08	17.2		
11/2009	Aaditya Maganti	16/07/97	28.1	A +ve	Krishna Yajur Veda	Kashyapa	9945505423	Venkata Raman		Business	Indian	Hindu	Brahmin	Telugu	MIG-18, APHB colony, Nallapaudu Rd., Guntur, Andhra Pradesh	Same	DAV public school	5th	"1483
date 13-3-08"	Prathama	27/07/09	16.1		
15/2009	V Harshavardhan Rao	14/04/99	26.4	A +ve	Krishna Yajur Veda	Kashyapa	8985594670 09008531478	V Chalapathi Rao		Agriculture	Indian	Hindu	Brahmin	Telugu	#1/39 Nayana Cheruvu palli, kadirinathuni kota Post,  Chittor-517390, Andhra Pradesh	Same	S V P High School	6th	20822	Prathama	30/10/09	15.8		
02/2010	Shashank M Hegde	31/03/98	27.4	B +ve	Krishna Yajur Veda	Jamadagni	"9448881108
9663047072"	Madhu Hegde		Electrician	Indian	Hindu	Brahmin	Kannada	1457/1, Varadajagudi Rd., Kote channa pattna, Ramnagar Dist. Karnataka	Same	Govt. Model Primary School	7th	"33/10-11
date15-6-10"	Prathama	21/03/10	15.5		
13/2010	Subraya M Hegde	07/12/99	25.8	A +ve	Krishna Yajur Veda	Vashista	9481633814	Manjunath Hegde		Farmer	Indian	Hindu	Brahmin	Kannada	Manjunath Hegde, gunda(p), joeda (tq), uttarkannada (d) Karnataka	Same	Govt Higher Primary School	5th	"6/2010-11
23/7/2010"	Prathama	01/06/10	15.3		
14/2010	Ganapathi M Hegde	28/04/98	27.4	A +ve	Krishna Yajur Veda	Vashista	9481633814	Manjunath Hegde		Farmer	Indian	Hindu	Brahmin	Kannada	Manjunath Hegde, gunda(p), joeda (tq), uttarkannada (d) Karnataka	Same	Govt Higher Primary School	7th	"26/10-11
22-06-2010"	Prathama	01/06/10	15.3		
12/2010	Uttamakumar Sharma	05/05/99	26.3	A +ve	Sama Veda	Parashara	8553737859	Ghanshyam Sharma		Security Supervisor	Indian	Hindu	Brahmin	Hindi	A O L Ashram	Navadi (v), purnadi (p), obera (tq), Aourangabad (d), Bihar	R U M V	5TH	"1864400
12-06-10"	Prathama	14/06/10	15.2		
22/2011	Amith Shukla	20/07/01	24.1	B +ve	Shukla Yajur Veda	Garg	"9914192948
9914867147"	Purnakameshwar Shukla		Farmer	Indian	Hindu	Brahmin	Hindi	Anuj Shukla, devariya (v), mushhari (p), deoria (d) - 274408 Uttar Pradesh	Same	P H P P S	5th	"44
02-07-2012"	Prathama	01/07/11	14.2		
19/2011	Shubham Shukla	17/10/02	22.9	O +ve	Shukla Yajur Veda	Garg	"9473514137
9935064300"	Purnakameshwar Shukla		Farmer	Indian	Hindu	Brahmin	Hindi	Anuj Shukla, devariya (v), mushhari (p), deoria (d) - 274408 Uttar Pradesh	Same	P H P P S	3rd	01/07/12	Prathama	02/07/11	14.2		
01/2012	Ankit Kashyap	06/03/00	25.5	O +ve	Atharvana Veda	Kashyapa	"7204843824
9035536948"	Sanjay Jha		Seva Ashram	Indian	Hindu	Brahmin	Hindi	Bhramarpur (v)(t), Narayanpur (anchal), Bhagalpur - 853 203 Bihar	Same	Zilla Shiksha Adeeshak	7th	"48
31-3-2012"	Prathama	19/06/12	13.2		
01/2013	Sangam Pathak	22/05/00	25.3	B +ve	Shukla Yajur Veda	Koushika	"97714353452
9841046493"	Nawaraj Pathak		Farmer	Nepali	Hindu	Brahmin	Nepali	Nawarajpathak, Thapa gaun (v), Thanapati Nuwakot (d), bagmati (s) Nepal	Same	Kantipur English Academy	7th	209/2070	Prathama	14/05/13	12.3		
04/2013	Om Shrinivas Bagalkot	01/05/02	23.4	AB +ve	Shukla Yajur Veda	Kaundinya	"9449983388
9611500721"	Shrinivas R Bagalkot		Clerk in Hospital	Indian	Hindu	Brahmin	Kannada	Saiadhar hospital, Rabkavi (v), Bagalkot (d) - 587314. Karnataka	Hospet lane, Rabkavi - 587314, Bagalkot, Karnataka	Bangarama Primary School	6th	"40/2013-14
28-6-2013"	Prathama	10/06/13	12.2		
05/2013	A Dhakshina Moorthy	19/06/03	22.2	O +ve	Rig Veda	Moudgalya	"9994520046
9047583774"	S Arun Raja		Purohit	Indian	Hindu	Brahmin	Telugu	Flat 76, new Bedalagam, Redthpopu, Ambur, Vellore (d), Tamilnadu	same	Hindu Aided Primary School	5th	-	Prathama	12/06/13	12.2		
07/2013	Harsha.R	30/10/99	25.9	O +ve	Rig Veda	Athreya	9535030048	Ramachandra Rao		Fabrication	Indian	Hindu	Brahmin	Kannada	274, 7th Man Road, Behinaveeramma Building, Vrushabavathi Nagar, KamakshiPalya, Bangalore - 560079. Karnataka	Same	Sri Maruthi Vidya Mandira Primary & High School	8th	"57/14-15
30-5-2014"	Prathama	01/07/13	12.2		
09/2013	Nitesh Sharma	05/11/02	22.8	B +ve	Shukla Yajur Veda	Koushika	"01792288117
9882227092"	Rattan Lal Sharma		Govt. Employee	Indian	Hindu	Brahmin	Hindi	hamni (v), dhayola (p), kandaghat (st), solan (d) - 173207. Himachal Pradesh	C/o R D Sharma, Sharma Bhawan, Near Durga Temple, P.O Bharari, Kelti, Shimla 171001. Himachal Pradesh	Him Adarsh Public School	5th	"15
25-6-2013"	Prathama	07/07/13	12.2		
10/2013	Rohit Sharma	26/10/03	21.9	B +ve	Shukla Yajur Veda	Koushika	"01792288117
9817886471"	Ghanshyam Sharma		Farmer	Indian	Hindu	Brahmin	Hindi	hamni (v), dhayola (p), kandaghat (st), solan (d) - 173207. Himachal Pradesh	C/o R D Sharma, Sharma Bhawan, Near Durga Temple, P.O Bharari, Kelti, Shimla 171001. Himachal Pradesh	Him Adarsh Public School	5th	"14
25-6-2013"	Prathama	07/07/13	12.2		
11/2013	Puneeth H L	19/07/99	26.1	B +ve	Shukla Yajur Veda	Bharadwaja	9845518347	Lokesh H K		Private Employee	Indian	Hindu	Brahmin	Kannada	hirandhali (v), virgonagar (po), bangalore - 560049. Karnataka	Same	Sree Venkateswara English High School	8th	201/2014-15	Prathama	12/09/13	12.0		
01/2014	Charan H R	23/09/02	23.0	AB +ve	Krishna Yajur Veda	Shalavatsa	"9448761087
9901695330"	H S Ramprasad		Electricals	Indian	Hindu	Brahmin	Kannada	#86, Ground floor, Sri Radhakrishna RoadTR nagar 1st block Bangalore-30	Same	S G P T A High School	6th	43/2014-15	Prathama	06/06/14	11.2		
04/2014	Sriram G	21/05/03	22.3	A +ve	Krishna Yajur Veda	Kashyapa	"8123406404
9036538880"	Gundu Rao K		Electrician	Indian	Hindu	Brahmin	Kannada	#72, 2nd cross, 1st main, Kenchenahalli Bangalore-98	Sri Chandrakala Krupa, Sriram Extn, Near Sriram Gym, Nituvalli, Davangere. Karnataka	Poorna Prajna Vidyapeetha	7th	18/2014-15	Prathama	07/06/14	11.2		
06/2014	Vinay Darbha	03/03/01	24.5	O +ve	Krishna Yajur Veda	Lohithasa	"08578230229
08008623833
9989388821"	Late. D Vijaya Kumar Sarma		Record Asst. SriKalahasthi Temple	Indian	Hindu	Brahmin	Telugu	16- 603/B,Pangal Rd., Shrikalahasti, Andhar Pradesh	Same	Nararyana E M High School	5th	85	Prathama	25/06/14	11.2		
08/2014	Vipin Sapkota	16/07/02	23.1	O +ve	Shukla Yajur Veda	Kaundinya	"00977
9847028355"	Bijay Mohan Sapkota		Indian Army	Nepali	Hindu	Brahmin	Nepali	Shawkarnagar-3, Roopandehi, Nepal	Same	P B H S S	7th	21/071	Prathama	10/07/14	11.2		
09/2014	Kedar Prasad Adhikari	10/06/01	24.2	A +ve	Shukla Yajur Veda	Kashyapa	"00977
9741009390"	Purna Prasad Adhikari		Purohit	Nepali	Hindu	Brahmin	Nepali	Dhngkhark ward no 2,Kabhre (d), Nepal	Same	S K G S S	7th	23/07/14	Prathama	10/07/14	11.2		
10/2014	Siddartha Pandey	24/07/02	23.1	A +ve	Shukla Yajur Veda	Kashyapa	"00977
71524972
9857023985"	Bishnu Prasad Pandey		AOL Teacher	Nepali	Hindu	Brahmin	Nepali	Bp path, siddarthanagar 8Bhairahawa, rupandhi (d), Nepal	Same	S G H S S	6th	10/071	Prathama	10/07/14	11.2		
12/2014	Bhishma Pandey	16/02/04	21.6	A +ve	Shukla Yajur Veda	Kashyapa	"00977
9857062271"	Ram Prasad Pandey		Farmer	Nepali	Hindu	Brahmin	Nepali	Pandhi, thulo lumpek-9,Gulmi (d), Nepal	Same	S D P V	5th	25	Prathama	13/07/14	11.1		
13/2014	Gaurav Upadhyay	15/04/03	22.4	O +ve	Shukla Yajur Veda	Bharadwaja	"00977
9807477587"	Pashupati Upadhayay		Farmer	Nepali	Hindu	Brahmin	Nepali	Bp path, siddartha nagar-8Bhairahawa, rupandhi (d), Nepal	Same	S S M V S	6th	90	Prathama	13/07/14	11.1		
14/2014	Bhuwan Pandey	08/06/03	22.2	O +ve	Shukla Yajur Veda	Kashyapa	"00977
9846297257"	Chirinjivi Pandey		Farmer	Nepali	Hindu	Brahmin	Nepali	Birgha, vdc ward no 7syanja(d),  Nepal	Same	S B E B S	4TH	09/04/71	Prathama	14/07/14	11.1		
15/2014	Dalendra Sharma	12/12/98	26.7	A +ve	Sama Veda	Koushika	8224031524	Dinesh Kumar Sharma		Farmer	Indian	Hindu	Brahmin	Hindi	Badhareta, Morena, Madhya Pradesh -476224	Same	U S S P S	8th	"73
11-7-2012"	Prathama	05/08/14	11.1		
03/2015	Narayan Datt Chaubey	10/12/01	23.7	A +ve	Shukla Yajur Veda	Katyan	9208076258	Manoj Chaubey		Farmer	Indian	Hindu	Brahmin	Bhojpuri	Bharouli Bazar (jamuna Sadan), Deoria, Uttar Pradesh.	Same	A S L M V	8TH	3780	Prathama	10/05/15	10.3		
01/2015	Aayush Bashyal	05/02/02	23.6	A +ve	Shukla Yajur Veda	Dhananjay	"00977
9847050969"	Krishna Prasad Bashyal		Farmer	Nepali	Hindu	Brahmin	Nepali	Siddhartha nagar-12, Bhairahawa, Bhairwah, Nepal	Same	C B P H S	7th	206	Prathama	12/05/15	10.3		
02/2015	Kiran Neupane	11/07/02	23.2	B +ve	Shukla Yajur Veda	Kaundanya	"00977
9857022060"	Pitamber Neupane		Farmer	Nepali	Hindu	Brahmin	Nepali	Sidhartha Nagar-8, Bhairawa,Nepal	Same	Kashi Noble Academy	7th	69063	Prathama	12/05/15	10.3		
04/2015	Prajowl Pandey	15/12/02	22.7	A +ve	Shukla Yajur Veda	Kashyapa	"00977
9847178231"	Dinesh Pandey		Farmer	Nepali	Hindu	Brahmin	Nepali	Archal-6, Syngja Gandaki Zone, Nepal.	Same	S K L S S	5th	-	Prathama	12/05/15	10.3		
05/2015	Trilok Pyakurel	22/06/03	22.2	A +ve	Shukla Yajur Veda	Kaundanya	"00977
9751011147"	Janaki Datta Pyakurel		Farmer	Nepali	Hindu	Brahmin	Nepali	Jumla, Dhapa VDS-1, Nepal.	Same	S D L H S S	5th	1673	Prathama	12/05/15	10.3		
06/2015	Gitesh M Upadhyay	05/12/97	27.8	O +ve	Shukla Yajur Veda	Vashista	"8483027079
9921112096"	Manoj Upadhyay		Bank Employee	Indian	Hindu	Brahmin	Gujarati	102, Budhwar Peth, Phaltan. Maharastra	Same	S V S M V		"14
9-6-2015"	Prathama	01/06/15	10.3		
09/2015	Santhosh U	13/03/98	27.5	B +ve	Krishna Yajur Veda	Kashyapa	"9739727351
9686178956"	Umashankar G		Farmer	Indian	Hindu	Brahmin	Kannada	5/51, Eshwara Temple Street, Kollegal Town, Chamaraja nagar - 571440. Karnataka	Same	Govt. High School	10th	"18/2013-14
20-7-2013"	Prathama	23/07/15	10.1		
11/2015	Shushil Kumar Upadhayay	04/03/01	24.5	B +ve	Shukla Yajur Veda	Atri	"0977
9807136094"	Bhuwan Prasad Upadhayay		Farmer	Nepali	Hindu	Brahmin	Bhojpuri	V D C Batra 7 Bara. Nepal	Same	-	-	-	Prathama	18/08/15	10.0		
12/2015	Sujit Kumar Pandey	05/05/05	20.3	A +ve	Shukla Yajur Veda	Sankrit	"0977
9816243231"	Lalan Pandey		Farmer	Nepali	Hindu	Brahmin	Bhojpuri	V D C Pheta 5 Bara. Nepal	Same	-	-	-	Prathama	18/08/15	10.0		
14/2015	Prashant Sharma	18/10/01	23.9	B +ve	Krishna Yajur Veda	Bharadwaja	7500430429	Prasann Sharma		Farmer	Indian	Hindu	Brahmin	Hindi	H No. 83, Ward No. 8, Mastar Coloney, Thana Rajpura, Tehgunnaur, Uttar Pradesh - 243727	Same	K U P Vidyalay	8th	28	Prathama	07/11/15	9.8		
15/2015	Shivam Jha	17/04/03	22.4	O +ve	Atharvana Veda	Kashyapa	"7204962582
8892422162"	Sanjay Kumar Jha		-	Indian	Hindu	Brahmin	Hindi	Saldodih, Post Tathguni, Bangalore South Dist	Bhramarpur (v)(t), Narayanpur (anchal), Bhagalpur - 853 203 Bihar	V V M V P	7th	-	Prathama	16/12/15	9.7		
01/2016	Suhas K V	10/02/01	24.6	O +ve	Krishna Yajur Veda	Vadhulasa	"9019790491
8105041807"	Late. Vasudev Murthy K R		Purohit	Indian	Hindu	Brahmin	Telugu	Vandana Paradise, 3rd Cross, Rupena Agrahara, Pent House, Bangalore - 27	4th Cross Prasant Nagar, Kolar - 563101	New Generation School	5th	32/13-14	Prathama	12/02/16	9.6		
03/2016	Nishan Bhattarai	09/10/05	19.9	B +ve	Shukla Yajur Veda	Vashista	"9847540311
9847390908"	Humnath Bhattarai		Farmer	Nepali	Hindu	Brahmin	Nepali	Thulolumpek-9, Dhusyni, Gulmi, Nepali	Same	Sri Dhuseni Primary Vidyalaya	5th	49	Prathama	29/06/16	9.2		
04/2016	Krishna Prasad Ghimire	29/02/04	21.5	A +ve	Shukla Yajur Veda	Kashyapa	"9847186710
9819445474"	Shekhar Nath Ghimire		Farmer	Nepali	Hindu	Brahmin	Nepali	Badagaun -7, Bharaha, Gulmi, Nepal	Same	Sri Prithvi Higher Secondary School	6th	43	Prathama	29/06/16	9.2		
05/2016	Shiv Shankar Mishra	29/07/04	21.1	O +ve	Sama Veda	Vatsa	9920194580	Dinesh Kumar Mishra		Purohit	Indian	Hindu	Brahmin	Hindi	Samrat Plaza, CHS, F No- 2, D-4, Bhirwade, Kansi, Ambernath (M)	Vill- Balpurava, Po- Ruebadal Rama Rul, Dist- Gonda, UP	S I C E S English Primary School,	6th	397	Prathama	01/07/16	9.2		
06/2016	Vishal Mishra	28/10/09	15.9	A -ve	Sama Veda	Koushika	"8097318947
8898981639"	Pramod Mishra		S O	Indian	Hindu	Brahmin	Hindi	Chintamanipur,Post- Barshati, Mariyahu Dist- Junpur UP- 222162	Chintamanipur,Post- Barshati, Mariyahu Dist- Junpur UP- 222162				Prathama	01/07/16	9.2		
07/2016	Navin Nath Tiwari	24/11/04	20.8	A +ve	Shukla Yajur Veda	GardMukh Shandilya	"9451438724
9125113103"	Pramod Nath Tiwari		Farmer	Indian	Hindu	Brahmin	Hindi	Ward No.1, Ambedkar Nagar, Deoria, UP 	Same				Prathama	02/07/16	9.2		
08/2016	Sanjeev Kumar Chaturbedi	19/04/03	22.4	B +ve	Shukla Yajur Veda	Bharadwaja	9855023057	Shivshankar Chaturvedi		Farmer	Nepali	Hindu	Brahmin	Hindi	Shrisiya Khalwa Tola Birgunj Nepal	Same	Pashupati Shiksha Mandir	7th	211	Prathama	13/07/16	9.1		
09/2016	P S D N Vamsi	06/02/06	19.6	B +ve	Krishna Yajur Veda	Bharadwaja	"7406452589
9945216756
9738445996"	P M V Ramakrishna		Employee	Indian	Hindu	Brahmin	Telugu	#206, 4th right, alphagardens, sri sai paradise, Aiyappa nagar bangalore-36	Same	Kendriya Vidyalaya Sangathan	6th	101696	Prathama	14/07/16	9.1		
10/2016	Rushikesha M Joshi	27/03/03	22.4	B +ve	Rig Veda	Jamaadgni	"9011420064
9420770076
02472-224379"	Mukund Devidasrao Joshi		Service	Indian	Hindu	Brahmin	Marathi	26/93/1, 'Harihar' krupa sadan, Behind Court, Near Pratham Lodge, Samarthnagar, Osmanabad	Same	SSRVM, Osmanabad	7th	1659	Prathama	14/07/16	9.1		
11/2016	Srivathsan H	07/12/02	22.7	A +ve	Krishna Yajur Veda	Srivatsa	"9943043101
9943043105"	S G K Hariharan		Self Employed	Indian	Hindu	Brahmin	Tamil	22/2, 15th South St. Thiyagarajanagar, Tirun	Same	Pushpalata Vidya Mandir	6th	484/2015-16	Prathama	14/07/16	9.1		
12/2016	Srivathsa G	29/10/03	21.9	O +ve	Rig Veda	Vishwamitra	9741829407	Gurumurthy Karanth		Self Employed	Indian	Hindu	Brahmin	Kannada	#48, 14th Main, Raghavendra Block, Srinagar, Bangalore - 560050	Same	Vijaya Bharati Vidyalaya	6th	130/2015-16	Prathama	14/07/16	9.1		
13/2016	K Sankaranarayanan	21/06/07	18.2	A +ve	Rig Veda	Kanwa	"8144531100
9688518494"	T V Kalyanaraman		Service	Indian	Hindu	Brahmin	Tamil	164/1, Sivasakthinagar, Sirupooluvapatti, Tirupur - 641603	Same	Jai Saradha Matriculation Higher Secondary School	4th	103/2015-16	Prathama	14/07/16	9.1		
14/2016	H S Amrutesh	26/07/01	24.1	O +ve	Sama Veda	Atreya	9900930161	Shashidhara H V		Purohit	Indian	Hindu	Brahmin	Kannada	Pattasomana Halli (p&v), Pandavpura Taluk, Mandya (D) 571434	Same	Kuvempu High School	10th	39/16-17	Prathama	29/07/16	9.1		
15/2016	N Venkatachalam	17/03/02	23.5	O +ve	Krishna Yajur Veda	Kaundanya	06360152250  08870370909	Neelakandan		Service	Indian	Hindu	Brahmin	Tamil	H 335 / 27, J J Nagar, Canara Bank(opp) Attur main road Nangiripattai, Rasipuram tallukTamilnadu-637406s	Same	Sri Sitaram Vidyalaya Matriculation Higher Secondary School	9-C	2426	Prathama	30/07/16	9.1		
16/2016	Gulshan Kumar	18/05/02	23.3	A +ve	Atharvana Veda	Vashista	9525056439	Vinodkumar Dubey		Farmer	Indian	Hindu	Brahmin	Hindi	Gram Rudravar, khurdapo, Rudravar, KalaThana, Vellaba, Kaimur, Bihar 	same				Prathama	24/10/16	8.9		
17/2016	Shrutish Shivapuji	14/02/04	21.6	A +ve	Shukla Yajur Veda	Bharadwaja	"9980742599
8050412344"	Shrinivas Shivapuji		Purohit	Indian	Hindu	Brahmin	Kannada	Sri Sura Saraswathi Gurukul & Jyotishalaya, Post Budigatti, Haveri Taluq & District 581128	Same				Parvesha	24/12/16	8.7	Admission Cancelled	"""
    
    students = []
    lines = raw_data.strip().split('\n')
    
    for line in lines:
        if not line.strip():
            continue
            
        # Split by tabs and clean up
        parts = [part.strip() for part in line.split('\t')]
        
        if len(parts) < 20:  # Skip incomplete records
            continue
            
        try:
            student = {
                "admissionNo": clean_text(parts[0]),
                "fullName": clean_text(parts[1]),
                "dateOfBirth": parse_date(parts[2]),
                "bloodGroup": clean_text(parts[4]),
                "shaakha": clean_text(parts[5]),
                "gothra": clean_text(parts[6]),
                "telephone": clean_text(parts[7]),
                "fatherName": clean_text(parts[8]),
                "motherName": clean_text(parts[9]),
                "occupation": clean_text(parts[10]),
                "nationality": clean_text(parts[11]),
                "religion": clean_text(parts[12]),
                "caste": clean_text(parts[13]),
                "motherTongue": clean_text(parts[14]),
                "presentAddress": clean_text(parts[15]),
                "permanentAddress": clean_text(parts[16]),
                "lastSchoolAttended": clean_text(parts[17]),
                "lastStandardStudied": clean_text(parts[18]),
                "tcDetails": clean_text(parts[19]),
                "admittedToStandard": clean_text(parts[20]),
                "dateOfAdmission": parse_date(parts[21]),
                "currentStandard": clean_text(parts[20]),  # Same as admitted
                "remarks": clean_text(parts[22]) if len(parts) > 22 else "",
                "guardianEmail": ""
            }
            
            # Only add if we have essential fields
            if student["admissionNo"] and student["fullName"] and student["dateOfBirth"]:
                students.append(student)
                
        except Exception as e:
            print(f"Error processing line: {line[:50]}... - {e}")
            continue
    
    return students

def main():
    """Main function to convert and save student data"""
    print("Converting student data to JSON format...")
    
    students = convert_student_data()
    
    print(f"Successfully converted {len(students)} students")
    
    # Save to JSON file
    output_file = "student-data-bulk-complete.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(students, f, indent=2, ensure_ascii=False)
    
    print(f"Data saved to {output_file}")
    
    # Print sample
    if students:
        print("\nSample student data:")
        print(json.dumps(students[0], indent=2, ensure_ascii=False))
    
    # Print statistics
    print(f"\nStatistics:")
    print(f"Total students: {len(students)}")
    
    # Count by nationality
    nationalities = {}
    for student in students:
        nat = student.get('nationality', 'Unknown')
        nationalities[nat] = nationalities.get(nat, 0) + 1
    
    print(f"By nationality:")
    for nat, count in nationalities.items():
        print(f"  {nat}: {count}")
    
    # Count by shaakha
    shaakhas = {}
    for student in students:
        shaakha = student.get('shaakha', 'Unknown')
        shaakhas[shaakha] = shaakhas.get(shaakha, 0) + 1
    
    print(f"\nBy Shaakha:")
    for shaakha, count in shaakhas.items():
        print(f"  {shaakha}: {count}")

if __name__ == "__main__":
    main()
